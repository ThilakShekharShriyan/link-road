import { CARS } from '../cast.js'

export const LANE_W = 3.7
export const LANES = 4
export const ROAD_W = LANE_W * LANES
export const CAM_BACK = 44
export const DROP_AHEAD = 150

const DROP_MAX = 400
const CRUISE = 24
const LOCAL_AHEAD = 200
const LOCAL_BEHIND = 30
const PLAN_AHEAD = 260
const LC_TIME = 3.6
const SIGNAL_TIME = 0.8
const HARD_BRAKE = 4.0

export const SPECS = {
  sedan: { L: 4.7, W: 1.84, H: 1.44 },
  hatch: { L: 4.2, W: 1.8, H: 1.48 },
  cab: { L: 4.8, W: 1.85, H: 1.66 },
  suv: { L: 4.85, W: 1.95, H: 1.76 },
  van: { L: 5.1, W: 2.0, H: 2.02 },
  truck: { L: 7.2, W: 2.35, H: 3.25 },
  police: { L: 4.9, W: 1.88, H: 1.58 },
}

const HAZARDS = {
  pothole: { scope: 'road', blocks: true, len: 1.6, sense: 40 },
  debris: { scope: 'road', blocks: true, len: 2.4, sense: 50 },
  speed: { scope: 'road', sign: true, len: 0.4, limit: 17.9, sense: 80 },
  police: { scope: 'lane', blocks: true, vehicle: 'police', speed: 0, sense: 60, color: '#f4f5f7' },
  slow: { scope: 'lane', blocks: true, vehicle: 'hatch', speed: 13, sense: 120, color: '#f08a24' },
  'custom-road': { scope: 'road', blocks: true, len: 2.4, sense: 50 },
  'custom-lane': { scope: 'lane', blocks: true, vehicle: 'van', speed: 15, sense: 120, color: '#a7b0bd' },
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const isCar = (o) => o.home !== undefined

export const laneCenter = (lane) => (lane + 0.5) * LANE_W
export const laneAt = (x) => clamp(Math.floor(x / LANE_W), 0, LANES - 1)
export const leadZ = (sim) => Math.max(...sim.cars.map((c) => c.z))
export const dropZ = (sim, z) => clamp(z, leadZ(sim) + DROP_AHEAD, leadZ(sim) + DROP_MAX)

export function createSim(link = true) {
  const meanZ = CARS.reduce((sum, c) => sum + c.z, 0) / CARS.length
  const cars = CARS.map((c) => ({
    ...c,
    ...SPECS[c.kind],
    home: c.lane,
    lane: c.lane,
    target: null,
    signal: 0,
    lcT: 0,
    lat: 0,
    latAcc: 0,
    fromX: laneCenter(c.lane),
    x: laneCenter(c.lane),
    z: c.z,
    v: CRUISE,
    v0: CRUISE,
    a: 0,
    yaw: 0,
    slot: c.z - meanZ,
    comfort: 100,
    hard: false,
    lastLc: -10,
    nextPlan: 0,
    known: new Map(),
    told: new Set(),
    yieldFor: null,
    yieldUntil: 0,
    dropUntil: 0,
    linkedUntil: 0,
    status: link ? 'idle' : 'solo',
    note: '',
  }))
  return {
    t: 0,
    cars,
    hazards: [],
    link,
    camZ: meanZ - CAM_BACK,
    events: [],
    arcs: [],
    said: new Map(),
    stats: { hardBrakes: 0, messages: 0 },
    nextId: 1,
  }
}

export function carLane(c) {
  return c.target != null && c.lat > 0.5 ? c.target : c.lane
}

function physLanes(o) {
  if (o.target == null) return [o.lane]
  if (o.lat < 0.12) return [o.lane]
  if (o.lat > 0.88) return [o.target]
  return [o.lane, o.target]
}

function claimLanes(o) {
  return o.target == null ? [o.lane] : [o.lane, o.target]
}

function actorsOf(sim) {
  return sim.hazards.filter((h) => h.vehicle)
}

function iidm(v, v0, gap, dv) {
  const A = 1.4
  const B = 2.0
  const S0 = 2.5
  const T = 1.3
  const ratio = v / Math.max(v0, 0.1)
  const free = v <= v0 ? A * (1 - ratio ** 4) : -B * (1 - (1 / ratio) ** ((A * 4) / B))
  if (gap == null) return free
  const sStar = S0 + Math.max(0, v * T + (v * dv) / (2 * Math.sqrt(A * B)))
  const z = sStar / Math.max(gap, 0.1)
  if (v <= v0) {
    if (z >= 1) return A * (1 - z * z)
    return free * (1 - z ** ((2 * A) / Math.max(free, 1e-3)))
  }
  return z >= 1 ? free + A * (1 - z * z) : free
}

function say(sim, speaker, text) {
  const key = `${speaker}|${text}`
  const last = sim.said.get(key)
  if (last != null && sim.t - last < 4) return
  sim.said.set(key, sim.t)
  sim.events.push({ speaker, text })
}

const names = (list) => list.map((c) => c.short).join(', ')

export function addHazard(sim, item, x, z) {
  const spec = HAZARDS[item.kind]
  if (!spec) return
  const vspec = spec.vehicle ? SPECS[spec.vehicle] : null
  const L = vspec ? vspec.L : spec.len
  const lane = laneAt(x)
  z = dropZ(sim, z)

  if (spec.blocks) {
    for (let pass = 0; pass < 3; pass += 1) {
      for (const o of [...sim.cars, ...actorsOf(sim)]) {
        if (!claimLanes(o).includes(lane)) continue
        const need = (o.L + L) / 2 + 80
        if (Math.abs(o.z - z) < need && o.z < z + 6) z = o.z + need
      }
    }
  }

  const h = {
    id: sim.nextId++,
    kind: item.kind,
    label: item.label,
    scope: spec.scope,
    sign: Boolean(spec.sign),
    blocks: Boolean(spec.blocks),
    lane: spec.sign ? -1 : lane,
    x: spec.sign ? ROAD_W + 1.9 : laneCenter(lane),
    z,
    v: spec.speed ?? 0,
    v0: spec.speed ?? 0,
    vehicle: spec.vehicle ?? null,
    color: spec.color,
    L,
    W: vspec ? vspec.W : 1.6,
    H: vspec ? vspec.H : 1,
    sense: spec.sense,
    limit: spec.limit,
    born: sim.t,
    cleared: false,
    seed: Math.floor(Math.random() * 1000),
    announced: new Set(),
  }
  sim.hazards.push(h)

  say(sim, null, h.sign ? `A WILD ${h.label} APPEARED! LIMIT 40 MPH.` : `A WILD ${h.label} APPEARED IN LANE ${lane + 1}!`)
  perceive(sim)
  say(sim, null, summary(sim, h))
}

function summary(sim, h) {
  if (!sim.link) return 'LINK IS OFF. EACH CAR ONLY SEES ABOUT 50 M AHEAD.'
  const heard = sim.cars.filter((c) => c.known.get(h.id) === 'link')
  const rest = sim.cars.filter((c) => !c.known.has(h.id))
  if (h.scope === 'road') {
    const passed = rest.filter((c) => c.z > h.z)
    return `ROAD NEWS: ${heard.length} CARS STILL COMING GOT IT.${passed.length ? ` ${names(passed)} ALREADY PASSED.` : ''}`
  }
  const lead = heard.length ? `${names(heard)} LINKED.` : 'NOBODY CLOSE YET.'
  return `LANE NEWS: ${lead}${rest.length ? ` ${names(rest)} STAY QUIET.` : ''}`
}

function inScope(h, ahead, laneGap) {
  if (h.scope === 'road') return ahead > 0
  return ahead < LOCAL_AHEAD && ahead > -LOCAL_BEHIND && laneGap <= 1
}

function perceive(sim) {
  for (const h of sim.hazards) {
    if (h.cleared) continue
    for (const c of sim.cars) {
      if (c.known.has(h.id)) continue
      const ahead = h.z - c.z
      if (ahead < -(h.L + c.L) / 2) continue
      const laneGap = h.lane < 0 ? 0 : Math.abs(carLane(c) - h.lane)
      let via = null
      if (sim.link && inScope(h, ahead, laneGap)) via = 'link'
      else if (ahead < h.sense) via = 'sensor'
      if (!via) continue
      c.known.set(h.id, via)
      if (via === 'link') {
        sim.stats.messages += 1
        c.linkedUntil = sim.t + 2.5
        sim.arcs.push({ from: { hazard: h.id }, to: c.id, t0: sim.t + Math.max(0, ahead) / 520, kind: 'warn' })
        if (h.scope === 'lane' && sim.t - h.born > 0.5) say(sim, c.short, `${h.label} IS CLOSE NOW. JOINING THE LINK.`)
      }
    }
  }
}

function leadFor(sim, c) {
  const mine = physLanes(c)
  let best = null
  for (const o of sim.cars) {
    if (o === c || o.z <= c.z) continue
    if (!physLanes(o).some((l) => mine.includes(l))) continue
    const gap = o.z - c.z - (o.L + c.L) / 2
    if (!best || gap < best.gap) best = { gap, v: o.v }
  }
  const commit = (c.v * c.v) / (2 * 2.5) + 12
  for (const h of sim.hazards) {
    if (!h.blocks || h.z <= c.z || !c.known.has(h.id)) continue
    if (!mine.includes(h.lane)) continue
    const gap = h.z - c.z - (h.L + c.L) / 2
    if (gap > commit && h.v < c.v - 3) continue
    if (c.target != null && c.target !== h.lane) {
      const clearIn = Math.max(0, c.signal) + (1 - c.lcT) * LC_TIME * 0.75
      if (gap > c.v * clearIn + 6) continue
    }
    if (!best || gap < best.gap) best = { gap, v: h.v }
  }
  return best
}

function laneThreat(sim, c, lane, horizon) {
  let best = null
  for (const h of sim.hazards) {
    if (!h.blocks || h.lane !== lane || !c.known.has(h.id)) continue
    const d = h.z - c.z
    if (d <= 0 || d > horizon) continue
    if (h.vehicle && h.v > c.v0 - 3) continue
    if (!best || d < best.d) best = { d, h }
  }
  return best
}

function gapCheck(sim, c, lane) {
  let lead = null
  let follower = null
  for (const o of [...sim.cars, ...actorsOf(sim)]) {
    if (o === c || !claimLanes(o).includes(lane)) continue
    const dz = o.z - c.z
    const sep = (o.L + c.L) / 2
    if (Math.abs(dz) < sep + 3) return { ok: false, leadOk: false, leadGap: 0, follower: dz < 0 ? o : null }
    if (dz > 0) {
      const gap = dz - sep
      if (!lead || gap < lead.gap) lead = { o, gap }
    } else {
      const gap = -dz - sep
      if (!follower || gap < follower.gap) follower = { o, gap }
    }
  }
  for (const h of sim.hazards) {
    if (!h.blocks || h.vehicle || h.lane !== lane || !c.known.has(h.id)) continue
    const d = h.z - c.z
    if (d > -h.L && d < 70) return { ok: false, leadOk: false, leadGap: 0, follower: null }
  }
  const leadOk = !lead || (lead.gap > 10 && iidm(c.v, CRUISE, lead.gap, c.v - lead.o.v) > -2)
  let followerOk = true
  if (follower) {
    const f = follower.o
    const af = iidm(f.v, f.v0 ?? CRUISE, follower.gap, f.v - c.v)
    followerOk = follower.gap > 8 && af > -2.5
  }
  return {
    ok: leadOk && followerOk,
    leadOk,
    leadGap: lead ? lead.gap : 999,
    follower: followerOk ? null : follower?.o ?? null,
  }
}

function plan(sim, c) {
  if (c.target != null || sim.t < c.nextPlan) return
  c.nextPlan = sim.t + 0.25
  const threat = laneThreat(sim, c, c.lane, PLAN_AHEAD)
  if (threat) {
    const options = [c.lane - 1, c.lane + 1].filter(
      (l) => l >= 0 && l < LANES && !laneThreat(sim, c, l, PLAN_AHEAD + 140),
    )
    if (!options.length) return
    const checks = options
      .map((l) => ({ l, ...gapCheck(sim, c, l) }))
      .sort(
        (a, b) =>
          Number(b.ok) - Number(a.ok) ||
          b.leadGap - a.leadGap ||
          Math.abs(a.l - c.home) - Math.abs(b.l - c.home),
      )
    const pick = checks[0]
    if (pick.ok) startLaneChange(sim, c, pick.l, threat)
    else {
      if (!pick.leadOk) c.dropUntil = sim.t + 0.6
      if (sim.link && pick.follower && isCar(pick.follower)) requestYield(sim, c, pick.follower, pick.l)
    }
    return
  }
  if (c.lane !== c.home && sim.t - c.lastLc > 5) {
    const l = c.lane + Math.sign(c.home - c.lane)
    if (laneThreat(sim, c, l, PLAN_AHEAD + 140)) return
    const check = gapCheck(sim, c, l)
    if (check.ok && check.leadGap > 25) startLaneChange(sim, c, l, null)
  }
}

function startLaneChange(sim, c, lane, threat) {
  c.target = lane
  c.signal = SIGNAL_TIME
  c.lcT = 0
  c.lat = 0
  c.fromX = c.x
  c.lastLc = sim.t
  if (threat) {
    const h = threat.h
    const key = `lc-${h.id}`
    if (!c.told.has(key)) {
      c.told.add(key)
      const d = Math.round(threat.d)
      if (c.known.get(h.id) === 'link') {
        say(sim, c.short, `${h.label} IN LANE ${c.lane + 1}, ${d} M OUT. SHIFTING TO LANE ${lane + 1}.`)
      } else {
        say(sim, c.short, `${h.label} AT ${d} M! SWERVING TO LANE ${lane + 1}.`)
      }
    }
  }
  if (!sim.link) return
  for (const o of sim.cars) {
    if (o === c || Math.abs(o.z - c.z) > 60) continue
    if (!claimLanes(o).some((l) => l === lane || l === c.lane)) continue
    sim.stats.messages += 1
    o.linkedUntil = sim.t + 2
    c.linkedUntil = sim.t + 2
    sim.arcs.push({ from: { car: c.id }, to: o.id, t0: sim.t, kind: 'intent' })
  }
}

function requestYield(sim, c, f, lane) {
  if (f.yieldFor === c.id && f.yieldUntil > sim.t) return
  f.yieldFor = c.id
  f.yieldUntil = sim.t + 4.5
  c.linkedUntil = sim.t + 3
  f.linkedUntil = sim.t + 3
  sim.stats.messages += 1
  sim.arcs.push({ from: { car: c.id }, to: f.id, t0: sim.t, kind: 'yield' })
  say(sim, c.short, `NEED LANE ${lane + 1}. ${f.short}, CAN YOU MAKE ROOM?`)
  say(sim, f.short, `EASING OFF. GAP OPENING FOR ${c.short}.`)
}

function desiredSpeed(sim, c, meanZ) {
  let v0 = CRUISE + clamp((c.slot - (c.z - meanZ)) * 0.05, -1.2, 1.2)
  if (c.yieldUntil > sim.t) v0 = Math.min(v0, CRUISE - 5)
  if (c.dropUntil > sim.t) v0 = Math.min(v0, CRUISE - 3)
  for (const h of sim.hazards) {
    const via = c.known.get(h.id)
    if (!via) continue
    const ahead = h.z - c.z
    if (h.sign && ahead > -40) {
      const d = ahead - 25
      v0 = Math.min(v0, d > 0 ? Math.sqrt(h.limit ** 2 + 2 * 0.9 * d) : h.limit)
      if (via === 'link' && !h.announced.has('ease')) {
        h.announced.add('ease')
        say(sim, null, `CARS EASE TO 40 MPH WELL BEFORE THE ${h.label}.`)
      } else if (via === 'sensor' && !c.told.has(`sign-${h.id}`)) {
        c.told.add(`sign-${h.id}`)
        say(sim, c.short, `${h.label} AT ${Math.round(ahead)} M! SLOWING DOWN.`)
      }
    }
    if (h.vehicle === 'police' && Math.abs(carLane(c) - h.lane) === 1 && ahead > -8 && ahead < 160) {
      const slow = CRUISE - 6
      const d = ahead - 40
      v0 = Math.min(v0, d > 0 ? Math.sqrt(slow ** 2 + 2 * 0.9 * d) : slow)
      if (!h.announced.has('move-over')) {
        h.announced.add('move-over')
        say(sim, null, `POLICE STOPPED IN LANE ${h.lane + 1}. NEIGHBOR LANES EASE OFF.`)
      }
    }
  }
  return v0
}

function updateLaneChange(c, dt) {
  if (c.target == null) {
    c.yaw = 0
    c.latAcc = 0
    return
  }
  if (c.signal > 0) {
    c.signal -= dt
    return
  }
  c.lcT = Math.min(1, c.lcT + dt / LC_TIME)
  const t = c.lcT
  const s = t * t * t * (10 - 15 * t + 6 * t * t)
  const ds = (30 * t * t - 60 * t ** 3 + 30 * t ** 4) / LC_TIME
  const dds = (60 * t - 180 * t * t + 120 * t ** 3) / (LC_TIME * LC_TIME)
  const span = laneCenter(c.target) - c.fromX
  c.x = c.fromX + span * s
  c.lat = s
  c.yaw = Math.atan2(span * ds, Math.max(c.v, 2))
  c.latAcc = span * dds
  if (c.lcT >= 1) {
    c.lane = c.target
    c.target = null
    c.x = laneCenter(c.lane)
    c.lat = 0
    c.yaw = 0
    c.latAcc = 0
  }
}

function comfort(sim, c, dt) {
  const decel = -c.a
  if (decel > 2) c.comfort = Math.max(0, c.comfort - (decel - 2) * 12 * dt)
  else c.comfort = Math.min(100, c.comfort + 3 * dt)
  if (decel > HARD_BRAKE && !c.hard) {
    c.hard = true
    sim.stats.hardBrakes += 1
    say(sim, null, `${c.short} USED HARD BRAKE! ${(decel / 9.81).toFixed(2)} G. NOT VERY COMFY...`)
  } else if (decel < 2.5) {
    c.hard = false
  }
}

function statuses(sim) {
  for (const c of sim.cars) {
    let status = sim.link ? 'idle' : 'solo'
    let note = ''
    if (sim.link) {
      if (c.linkedUntil > sim.t) status = 'linked'
      for (const h of sim.hazards) {
        if (h.cleared) continue
        const via = c.known.get(h.id)
        if (via === 'link') {
          status = 'linked'
          continue
        }
        if (via || status === 'linked') continue
        if (h.z < c.z) {
          status = 'quiet'
          note = 'PASSED'
        } else if (h.scope === 'lane') {
          status = 'quiet'
          note = Math.abs(carLane(c) - h.lane) > 1 ? 'FAR LANE' : 'TOO FAR'
        }
      }
    }
    c.status = status
    c.note = note
  }
}

export function step(sim, dt) {
  sim.t += dt
  perceive(sim)
  const meanZ = sim.cars.reduce((sum, c) => sum + c.z, 0) / sim.cars.length
  for (const c of sim.cars) plan(sim, c)
  for (const c of sim.cars) c.v0 = desiredSpeed(sim, c, meanZ)

  const accel = sim.cars.map((c) => {
    const lead = leadFor(sim, c)
    return clamp(iidm(c.v, c.v0, lead?.gap, lead ? c.v - lead.v : 0), -8.5, 1.6)
  })
  sim.cars.forEach((c, i) => {
    c.a += (accel[i] - c.a) * Math.min(1, dt * 10)
    c.v = Math.max(0, c.v + c.a * dt)
    c.z += c.v * dt
    updateLaneChange(c, dt)
    comfort(sim, c, dt)
  })

  const actors = actorsOf(sim)
  for (const h of actors) {
    if (h.v0 <= 0) continue
    let lead = null
    for (const o of [...sim.cars, ...actors]) {
      if (o === h || o.z <= h.z || !physLanes(o).includes(h.lane)) continue
      const gap = o.z - h.z - (o.L + h.L) / 2
      if (!lead || gap < lead.gap) lead = { gap, v: o.v }
    }
    const a = clamp(iidm(h.v, h.v0, lead?.gap, lead ? h.v - lead.v : 0), -8.5, 1.5)
    h.v = Math.max(0, h.v + a * dt)
    h.z += h.v * dt
  }

  for (const c of sim.cars) {
    const lead = leadFor(sim, c)
    if (lead && lead.gap < 0.3) {
      c.z -= 0.3 - lead.gap
      c.v = Math.min(c.v, lead.v)
    }
  }

  const mean = sim.cars.reduce((sum, c) => sum + c.z, 0) / sim.cars.length
  const rear = Math.min(...sim.cars.map((c) => c.z - c.L / 2))
  const want = Math.min(mean, rear + 30) - CAM_BACK
  sim.camZ += (want - sim.camZ) * Math.min(1, dt * 1.5)

  for (const h of sim.hazards) {
    if (h.cleared) continue
    const margin = h.sign ? 40 : 2
    if (sim.cars.every((c) => c.z - c.L / 2 > h.z + h.L / 2 + margin)) {
      h.cleared = true
      if (sim.cars.some((c) => c.known.has(h.id))) {
        say(sim, null, `ALL CARS CLEARED THE ${h.label}. HARD BRAKES: ${sim.stats.hardBrakes}.`)
      }
    }
  }
  const cut = sim.camZ - 40
  const gone = sim.hazards.filter((h) => h.z < cut || h.z > sim.camZ + 1500)
  if (gone.length) {
    sim.hazards = sim.hazards.filter((h) => !gone.includes(h))
    for (const c of sim.cars) for (const g of gone) c.known.delete(g.id)
  }

  statuses(sim)
  sim.arcs = sim.arcs.filter((a) => sim.t - a.t0 < 1.8)
}
