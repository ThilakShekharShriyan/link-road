import { CAM_BACK, LANES, LANE_W, ROAD_W, SPECS, carLane, laneAt, laneCenter } from './world.js'

const CAM_H = 13
const PACK_REAR = 27
const REAR_AT = 0.86
const FAR = 1300
const FOG_D = 520
const HORIZON = 0.075
const SUN = norm([-0.45, 0.85, -0.3])

const SKY_TOP = rgb('#6fb3e8')
const SKY_LOW = rgb('#d4ebf3')
const FOG = rgb('#cfe4ec')
const GRASS_A = rgb('#6aa84f')
const GRASS_B = rgb('#629f48')
const ASPHALT = rgb('#4a4e56')
const SHOULDER = rgb('#5a5e66')
const TRACK = rgb('#43474f')
const PAINT = rgb('#f2f2ec')
const YELLOW = rgb('#f3c331')
const CONCRETE = rgb('#c9c6bc')
const STEEL = rgb('#aeb5bd')
const GLASS = rgb('#1f2b38')
const TIRE = rgb('#18191d')
const TAIL = rgb('#a5161c')
const TAIL_ON = rgb('#ff3b30')
const AMBER = rgb('#ffae1a')

const LINK = '#3ff2ff'
const ARC = { warn: '#ffd34d', intent: '#3ff2ff', yield: '#ff7ad9' }

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function css(c, a = 1) {
  return a >= 1
    ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`
    : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`
}
function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}
function mul(c, s) {
  return [Math.min(255, c[0] * s), Math.min(255, c[1] * s), Math.min(255, c[2] * s)]
}
function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
function lerp3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}
const fogK = (d) => Math.min(0.94, 1 - Math.exp(-Math.max(0, d) / FOG_D))
const fogged = (c, d) => mix(c, FOG, fogK(d))

function makeCam(sim, W, H) {
  const f = Math.min(H * 2.05, W * 1.9)
  const cy0 = H * 0.5
  const tilt = Math.atan(((0.5 - HORIZON) * H) / f)
  const sin = Math.sin(tilt)
  const cos = Math.cos(tilt)
  const s = (REAR_AT - 0.5) / (f / H)
  const dz = (CAM_H * (cos - s * sin)) / (sin + s * cos)
  return {
    W,
    H,
    f,
    cy0,
    cx: ROAD_W / 2,
    cy: CAM_H,
    cz: sim.camZ + CAM_BACK - PACK_REAR - dz,
    sin,
    cos,
    horizon: cy0 - f * Math.tan(tilt),
  }
}

function proj(cam, p) {
  const dx = p[0] - cam.cx
  const dy = p[1] - cam.cy
  const dz = p[2] - cam.cz
  const Y = dy * cam.cos + dz * cam.sin
  const Z = -dy * cam.sin + dz * cam.cos
  if (Z < 0.5) return null
  return [cam.W / 2 + (cam.f * dx) / Z, cam.cy0 - (cam.f * Y) / Z, Z]
}

export function screenToRoad(cam, sx, sy) {
  if (!cam) return null
  const a = (sx - cam.W / 2) / cam.f
  const b = -(sy - cam.cy0) / cam.f
  const dy = b * cam.cos - cam.sin
  if (dy >= -0.01) return null
  const dz = b * cam.sin + cam.cos
  const t = -cam.cy / dy
  return { x: cam.cx + a * t, z: cam.cz + dz * t }
}

function path(ctx, pts) {
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1])
  ctx.closePath()
}

function groundQuad(ctx, cam, x0, x1, z0, z1, color, y = 0) {
  z0 = Math.max(z0, cam.cz + 1)
  if (z1 <= z0) return
  const a = proj(cam, [x0, y, z0])
  const b = proj(cam, [x1, y, z0])
  const c = proj(cam, [x1, y, z1])
  const d = proj(cam, [x0, y, z1])
  if (!a || !b || !c || !d) return
  path(ctx, [a, b, c, d])
  ctx.fillStyle = css(fogged(color, (a[2] + d[2]) / 2))
  ctx.fill()
}

/* ---------- solids ---------- */

const FACES = {
  rear: [0, 1, 5, 4],
  front: [2, 3, 7, 6],
  left: [3, 0, 4, 7],
  right: [1, 2, 6, 5],
  top: [4, 5, 6, 7],
}

function hexa(w0, y0, zr0, zf0, w1, y1, zr1, zf1, yf0 = y0, yf1 = y1) {
  return [
    [-w0, y0, zr0],
    [w0, y0, zr0],
    [w0, yf0, zf0],
    [-w0, yf0, zf0],
    [-w1, y1, zr1],
    [w1, y1, zr1],
    [w1, yf1, zf1],
    [-w1, yf1, zf1],
  ]
}

const box = (w, y0, y1, zr, zf) => hexa(w, y0, zr, zf, w, y1, zr, zf)

function poseFn(pose) {
  const cy = Math.cos(pose.yaw || 0)
  const sy = Math.sin(pose.yaw || 0)
  const cp = Math.cos(pose.pitch || 0)
  const sp = Math.sin(pose.pitch || 0)
  const cr = Math.cos(pose.roll || 0)
  const sr = Math.sin(pose.roll || 0)
  return (v, body = true) => {
    let [x, y, z] = v
    if (body) {
      y -= 0.5
      const x1 = x * cr - y * sr
      const y1 = x * sr + y * cr
      const y2 = y1 * cp - z * sp
      const z2 = y1 * sp + z * cp
      x = x1
      y = y2 + 0.5
      z = z2
    }
    return [pose.x + x * cy + z * sy, y, pose.z - x * sy + z * cy]
  }
}

function drawSolid(ctx, cam, world, style) {
  const center = world.reduce((s, v) => [s[0] + v[0] / 8, s[1] + v[1] / 8, s[2] + v[2] / 8], [0, 0, 0])
  const camPos = [cam.cx, cam.cy, cam.cz]
  const screen = world.map((v) => proj(cam, v))
  if (screen.some((p) => !p)) return
  for (const name of ['left', 'right', 'rear', 'front', 'top']) {
    const idx = FACES[name]
    const q = idx.map((i) => world[i])
    let n = norm(cross(sub(q[1], q[0]), sub(q[3], q[0])))
    const fc = lerp3(lerp3(q[0], q[1], 0.5), lerp3(q[3], q[2], 0.5), 0.5)
    if (dot(n, sub(fc, center)) < 0) n = [-n[0], -n[1], -n[2]]
    if (dot(n, sub(camPos, fc)) <= 0.0001) continue
    const pts = idx.map((i) => screen[i])
    const depth = pts.reduce((s, p) => s + p[2], 0) / 4
    const light = 0.62 + 0.42 * Math.max(0, dot(n, SUN))
    const base = style[name] || style.color
    const glass = style.glass?.includes(name)
    path(ctx, pts)
    if (glass) {
      const top = lerp3(pts[2], pts[3], 0.5)
      const bot = lerp3(pts[0], pts[1], 0.5)
      const g = ctx.createLinearGradient(top[0], top[1], bot[0], bot[1])
      const sky = name === 'top' ? 1.25 : n[1] > 0.3 ? 1.1 : 0.85
      g.addColorStop(0, css(fogged(mix(GLASS, SKY_LOW, 0.55 * sky), depth)))
      g.addColorStop(0.45, css(fogged(mix(GLASS, SKY_LOW, 0.18), depth)))
      g.addColorStop(1, css(fogged(GLASS, depth)))
      ctx.fillStyle = g
    } else {
      ctx.fillStyle = css(fogged(mul(base, light), depth))
    }
    ctx.fill()
    if (style.edge !== false) {
      ctx.strokeStyle = css(fogged(mul(glass ? GLASS : base, 0.55), depth), 0.55)
      ctx.lineWidth = 0.7
      ctx.stroke()
    }
    const decals = style.decals?.[name]
    if (decals) {
      for (const d of decals) {
        const pt = (u, v) => proj(cam, lerp3(lerp3(q[0], q[1], u), lerp3(q[3], q[2], u), v))
        const dp = [pt(d.u0, d.v0), pt(d.u1, d.v0), pt(d.u1, d.v1), pt(d.u0, d.v1)]
        if (dp.some((p) => !p)) continue
        path(ctx, dp)
        ctx.fillStyle = d.glow ? css(d.color) : css(fogged(mul(d.color, light), depth))
        ctx.fill()
        if (d.glow && d.halo) {
          const c = lerp3(dp[0], dp[2], 0.5)
          const r = Math.max(6, Math.hypot(dp[2][0] - dp[0][0], dp[2][1] - dp[0][1]) * 2.2)
          const g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], r)
          g.addColorStop(0, css(d.color, 0.55 * d.halo))
          g.addColorStop(1, css(d.color, 0))
          ctx.save()
          ctx.globalCompositeOperation = 'lighter'
          ctx.fillStyle = g
          ctx.fillRect(c[0] - r, c[1] - r, r * 2, r * 2)
          ctx.restore()
        }
      }
    }
  }
}

/* ---------- vehicles ---------- */

const BODY = {
  sedan: { y0: 0.3, beltR: 0.94, beltF: 0.82, cabR: 1.05, cabF: 1.6, roofR: 1.6, roofF: 2.3, inset: 0.2, r: 0.33, axF: 1.0, axR: 1.05 },
  police: { y0: 0.3, beltR: 0.95, beltF: 0.84, cabR: 1.1, cabF: 1.65, roofR: 1.65, roofF: 2.35, inset: 0.2, r: 0.34, axF: 1.0, axR: 1.1 },
  cab: { y0: 0.3, beltR: 0.96, beltF: 0.86, cabR: 1.05, cabF: 1.55, roofR: 1.55, roofF: 2.3, inset: 0.2, r: 0.34, axF: 1.0, axR: 1.05 },
  hatch: { y0: 0.3, beltR: 0.96, beltF: 0.84, cabR: 0.14, cabF: 1.3, roofR: 0.42, roofF: 2.0, inset: 0.18, r: 0.32, axF: 0.85, axR: 0.75 },
  suv: { y0: 0.4, beltR: 1.04, beltF: 0.98, cabR: 0.1, cabF: 1.35, roofR: 0.22, roofF: 1.95, inset: 0.12, r: 0.38, axF: 0.95, axR: 0.95 },
  van: { y0: 0.36, beltR: 1.08, beltF: 1.02, cabR: 0.05, cabF: 0.95, roofR: 0.08, roofF: 1.6, inset: 0.08, r: 0.35, axF: 0.85, axR: 0.95 },
}

function vehicleParts(kind, color, state, t) {
  const spec = SPECS[kind]
  const L = spec.L
  const w = spec.W / 2
  const H = spec.H
  const blink = Math.floor(t * 3) % 2 === 0
  const braking = state.brake
  const tailColor = braking ? TAIL_ON : TAIL
  const tailHalo = braking ? 1 : 0
  const leftOn = blink && (state.signal < 0 || state.hazard)
  const rightOn = blink && (state.signal > 0 || state.hazard)
  const body = rgb(color)
  const parts = []

  if (kind === 'truck') {
    const r = 0.5
    const boxFront = L / 2 - 2.35
    for (const z of [L / 2 - 1.1, -L / 2 + 1.5, -L / 2 + 2.6]) {
      parts.push({ v: box(0.24, 0, r * 2, z - r, z + r).map((p) => [p[0] + (w - 0.26), p[1], p[2]]), s: { color: TIRE, edge: false }, rigid: true })
      parts.push({ v: box(0.24, 0, r * 2, z - r, z + r).map((p) => [p[0] - (w - 0.26), p[1], p[2]]), s: { color: TIRE, edge: false }, rigid: true })
    }
    parts.push({ v: box(w - 0.3, 0.55, 1.0, -L / 2 + 0.2, L / 2 - 0.4), s: { color: rgb('#2a2c31') } })
    parts.push({
      v: box(w, 1.0, H, -L / 2, boxFront),
      s: {
        color: mul(body, 0.95),
        top: mul(body, 0.9),
        decals: {
          rear: [
            { u0: 0.06, v0: 0.04, u1: 0.94, v1: 0.96, color: mul(body, 0.8) },
            { u0: 0.08, v0: 0.3, u1: 0.92, v1: 0.32, color: mul(body, 0.6) },
            { u0: 0.08, v0: 0.55, u1: 0.92, v1: 0.57, color: mul(body, 0.6) },
            { u0: 0.08, v0: 0.8, u1: 0.92, v1: 0.82, color: mul(body, 0.6) },
            { u0: 0.03, v0: 0.02, u1: 0.11, v1: 0.1, color: tailColor, glow: true, halo: tailHalo },
            { u0: 0.89, v0: 0.02, u1: 0.97, v1: 0.1, color: tailColor, glow: true, halo: tailHalo },
            ...(leftOn ? [{ u0: 0.03, v0: 0.11, u1: 0.11, v1: 0.16, color: AMBER, glow: true, halo: 0.8 }] : []),
            ...(rightOn ? [{ u0: 0.89, v0: 0.11, u1: 0.97, v1: 0.16, color: AMBER, glow: true, halo: 0.8 }] : []),
          ],
          left: [{ u0: 0.02, v0: 0.42, u1: 0.98, v1: 0.5, color: rgb('#f4efe6') }],
          right: [{ u0: 0.02, v0: 0.42, u1: 0.98, v1: 0.5, color: rgb('#f4efe6') }],
        },
      },
    })
    parts.push({ v: box(w - 0.05, 0.5, 1.45, boxFront + 0.1, L / 2), s: { color: body } })
    parts.push({
      v: hexa(w - 0.08, 1.45, boxFront + 0.12, L / 2 - 0.05, w - 0.16, 2.65, boxFront + 0.12, L / 2 - 0.45),
      s: { color: body, glass: ['front'], decals: { left: [{ u0: 0.05, v0: 0.25, u1: 0.55, v1: 0.85, color: GLASS }], right: [{ u0: 0.45, v0: 0.25, u1: 0.95, v1: 0.85, color: GLASS }] } },
    })
    return parts
  }

  const b = BODY[kind]
  const r = b.r
  const zF = L / 2 - b.axF
  const zR = -L / 2 + b.axR
  for (const z of [zF, zR]) {
    for (const side of [-1, 1]) {
      parts.push({ v: box(0.12, 0, r * 2, z - r, z + r).map((p) => [p[0] + side * (w - 0.14), p[1], p[2]]), s: { color: TIRE, edge: false }, rigid: true })
    }
  }

  const beltAt = (z) => b.beltR + ((b.beltF - b.beltR) * (z + L / 2)) / L
  const cabR = -L / 2 + b.cabR
  const cabF = L / 2 - b.cabF
  const plate = { u0: 0.4, v0: 0.3, u1: 0.6, v1: 0.52, color: rgb('#eef0e6') }

  parts.push({
    v: hexa(w, b.y0, -L / 2, L / 2, w - 0.05, b.beltR, -L / 2 + 0.08, L / 2 - 0.12, b.y0, b.beltF),
    s: {
      color: body,
      top: mul(body, 1.04),
      decals: {
        rear: [
          { u0: 0.0, v0: 0.0, u1: 1.0, v1: 0.2, color: mul(body, 0.55) },
          plate,
          { u0: 0.04, v0: 0.58, u1: 0.25, v1: 0.86, color: tailColor, glow: braking, halo: tailHalo },
          { u0: 0.75, v0: 0.58, u1: 0.96, v1: 0.86, color: tailColor, glow: braking, halo: tailHalo },
          ...(braking ? [{ u0: 0.42, v0: 0.9, u1: 0.58, v1: 0.96, color: TAIL_ON, glow: true, halo: 0.5 }] : []),
          ...(leftOn ? [{ u0: 0.04, v0: 0.48, u1: 0.16, v1: 0.58, color: AMBER, glow: true, halo: 1 }] : []),
          ...(rightOn ? [{ u0: 0.84, v0: 0.48, u1: 0.96, v1: 0.58, color: AMBER, glow: true, halo: 1 }] : []),
        ],
        left: [
          { u0: 0.0, v0: 0.0, u1: 1.0, v1: 0.16, color: mul(body, 0.5) },
          { u0: 0.38, v0: 0.62, u1: 0.4, v1: 1, color: mul(body, 0.7) },
          ...(kind === 'police' ? [{ u0: 0.3, v0: 0.18, u1: 0.68, v1: 0.92, color: rgb('#1a2230') }] : []),
          ...(leftOn ? [{ u0: 0.02, v0: 0.7, u1: 0.08, v1: 0.85, color: AMBER, glow: true, halo: 0.6 }] : []),
        ],
        right: [
          { u0: 0.0, v0: 0.0, u1: 1.0, v1: 0.16, color: mul(body, 0.5) },
          { u0: 0.6, v0: 0.62, u1: 0.62, v1: 1, color: mul(body, 0.7) },
          ...(kind === 'police' ? [{ u0: 0.32, v0: 0.18, u1: 0.7, v1: 0.92, color: rgb('#1a2230') }] : []),
          ...(rightOn ? [{ u0: 0.92, v0: 0.7, u1: 0.98, v1: 0.85, color: AMBER, glow: true, halo: 0.6 }] : []),
        ],
        top: kind === 'cab' ? [{ u0: 0.1, v0: 0.02, u1: 0.9, v1: 0.12, color: rgb('#1d1d1d') }] : undefined,
      },
    },
  })

  parts.push({
    v: hexa(
      w - 0.08,
      beltAt(cabR),
      cabR,
      cabF,
      w - b.inset - 0.06,
      H,
      -L / 2 + b.roofR,
      L / 2 - b.roofF,
      beltAt(cabF),
      H,
    ),
    s: {
      color: body,
      top: mul(body, 1.08),
      glass: kind === 'van' ? ['front'] : ['rear', 'front', 'left', 'right'],
      decals: {
        ...(kind === 'van'
          ? {
              rear: [{ u0: 0.08, v0: 0.42, u1: 0.92, v1: 0.92, color: GLASS }],
              left: [{ u0: 0.04, v0: 0.4, u1: 0.96, v1: 0.88, color: GLASS }],
              right: [{ u0: 0.04, v0: 0.4, u1: 0.96, v1: 0.88, color: GLASS }],
            }
          : {
              left: [{ u0: kind === 'hatch' ? 0.36 : 0.45, v0: 0, u1: kind === 'hatch' ? 0.39 : 0.48, v1: 1, color: mul(body, 0.65) }],
              right: [{ u0: kind === 'hatch' ? 0.61 : 0.52, v0: 0, u1: kind === 'hatch' ? 0.64 : 0.55, v1: 1, color: mul(body, 0.65) }],
            }),
        top:
          kind === 'suv'
            ? [
                { u0: 0.05, v0: 0.08, u1: 0.1, v1: 0.92, color: rgb('#2a2d33') },
                { u0: 0.9, v0: 0.08, u1: 0.95, v1: 0.92, color: rgb('#2a2d33') },
              ]
            : kind === 'hatch'
              ? [{ u0: 0.15, v0: 0.0, u1: 0.85, v1: 0.06, color: mul(body, 0.7) }]
              : undefined,
      },
    },
  })

  const roofMid = (-L / 2 + b.roofR + L / 2 - b.roofF) / 2
  if (kind === 'police') {
    const on = Math.floor(t * 6) % 2 === 0
    parts.push({ v: box(0.6, H, H + 0.13, roofMid - 0.14, roofMid + 0.14), s: { color: rgb('#202430'), edge: false, decals: {
      top: [
        { u0: 0.02, v0: 0.1, u1: 0.48, v1: 0.9, color: on ? rgb('#ff2a2a') : rgb('#5a1010'), glow: on, halo: on ? 1.4 : 0 },
        { u0: 0.52, v0: 0.1, u1: 0.98, v1: 0.9, color: on ? rgb('#16204a') : rgb('#2f6bff'), glow: !on, halo: on ? 0 : 1.4 },
      ],
      rear: [
        { u0: 0.02, v0: 0.1, u1: 0.48, v1: 0.9, color: on ? rgb('#ff2a2a') : rgb('#5a1010'), glow: on, halo: on ? 1.4 : 0 },
        { u0: 0.52, v0: 0.1, u1: 0.98, v1: 0.9, color: on ? rgb('#16204a') : rgb('#2f6bff'), glow: !on, halo: on ? 0 : 1.4 },
      ],
    } } })
  }
  if (kind === 'cab') {
    parts.push({ v: box(0.36, H, H + 0.26, roofMid - 0.16, roofMid + 0.16), s: { color: rgb('#fff6d6'), decals: { rear: [{ u0: 0.12, v0: 0.25, u1: 0.88, v1: 0.75, color: rgb('#222') }] } } })
  }
  if (kind !== 'van') {
    const mz = cabF - 0.15
    const my = beltAt(mz) + 0.12
    for (const side of [-1, 1]) {
      parts.push({ v: box(0.09, my, my + 0.14, mz - 0.07, mz + 0.07).map((p) => [p[0] + side * (w + 0.06), p[1], p[2]]), s: { color: mul(body, 0.9) } })
    }
  }
  return parts
}

function drawVehicle(ctx, cam, pose, kind, color, state, t) {
  const place = poseFn(pose)
  for (const part of vehicleParts(kind, color, state, t)) {
    drawSolid(ctx, cam, part.v.map((v) => place(v, !part.rigid)), part.s)
  }
}

function drawShadow(ctx, cam, x, z, L, W, yaw = 0) {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const pt = (lx, lz) => proj(cam, [x + 0.35 + lx * c + lz * s, 0.01, z - 0.25 - lx * s + lz * c])
  for (const [grow, alpha] of [[0.45, 0.12], [0.12, 0.3]]) {
    const w = W / 2 + grow
    const l = L / 2 + grow
    const pts = [pt(-w, -l), pt(w, -l), pt(w, l), pt(-w, l)]
    if (pts.some((p) => !p)) return
    path(ctx, pts)
    ctx.fillStyle = `rgba(16,22,30,${alpha})`
    ctx.fill()
  }
}

/* ---------- scenery ---------- */

function drawSky(ctx, cam, t) {
  const { W, horizon } = cam
  const g = ctx.createLinearGradient(0, 0, 0, Math.max(1, horizon))
  g.addColorStop(0, css(SKY_TOP))
  g.addColorStop(1, css(SKY_LOW))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, horizon + 2)

  for (let i = 0; i < 6; i += 1) {
    const span = W + 400
    const x = ((hash(i + 3) * span + t * (4 + i)) % span) - 200
    const y = horizon * (0.15 + hash(i + 9) * 0.55)
    const s = 40 + hash(i + 21) * 60
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.beginPath()
    ctx.ellipse(x, y, s, s * 0.22, 0, 0, Math.PI * 2)
    ctx.ellipse(x - s * 0.35, y + s * 0.05, s * 0.5, s * 0.18, 0, 0, Math.PI * 2)
    ctx.ellipse(x + s * 0.3, y - s * 0.08, s * 0.45, s * 0.2, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  const ridge = (seed, amp, color, step) => {
    ctx.beginPath()
    ctx.moveTo(0, horizon + 1)
    for (let x = 0; x <= W + step; x += step) {
      const k = x / W
      const y =
        horizon -
        amp *
          (0.45 +
            0.3 * Math.sin(k * 7 + seed) +
            0.18 * Math.sin(k * 17 + seed * 2) +
            0.07 * Math.sin(k * 41 + seed * 3))
      ctx.lineTo(x, y)
    }
    ctx.lineTo(W, horizon + 1)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
  }
  ridge(1.3, cam.H * 0.05, css(mix(rgb('#8fb0c4'), SKY_LOW, 0.35)), 18)

  const base = horizon + 1
  ctx.fillStyle = css(mix(rgb('#7f95a8'), SKY_LOW, 0.3))
  for (let i = 0; i < 26; i += 1) {
    const x = W * 0.58 + (i - 13) * W * 0.008 + hash(i) * 4
    const h = cam.H * (0.012 + hash(i + 40) ** 2 * 0.05)
    ctx.fillRect(x, base - h, W * 0.0065, h)
  }
  ridge(4.1, cam.H * 0.026, css(mix(rgb('#6f9a7c'), SKY_LOW, 0.3)), 14)
}

function drawGround(ctx, cam) {
  const { W, H, horizon } = cam
  ctx.fillStyle = css(mix(GRASS_A, FOG, 0.85))
  ctx.fillRect(0, horizon, W, H - horizon)

  const near = cam.cz + 4
  const X0 = -500
  const X1 = ROAD_W + 500
  for (let z = Math.floor((cam.cz + FAR) / 10) * 10; z >= Math.floor(near / 10) * 10; z -= 10) {
    const stripe = Math.floor(z / 10) % 2 === 0 ? GRASS_A : GRASS_B
    groundQuad(ctx, cam, X0, X1, z, z + 10, stripe)
  }

  const zFar = cam.cz + FAR
  for (let s = Math.floor(zFar / 40) * 40; s >= Math.floor(near / 40) * 40; s -= 40) {
    groundQuad(ctx, cam, -1.4, 0, s, s + 40, SHOULDER)
    groundQuad(ctx, cam, ROAD_W, ROAD_W + 3, s, s + 40, SHOULDER)
    groundQuad(ctx, cam, 0, ROAD_W, s, s + 40, ASPHALT)
    for (let l = 0; l < LANES; l += 1) {
      const cx = (l + 0.5) * LANE_W
      groundQuad(ctx, cam, cx - 1.05, cx - 0.55, s, s + 40, TRACK)
      groundQuad(ctx, cam, cx + 0.55, cx + 1.05, s, s + 40, TRACK)
    }
    groundQuad(ctx, cam, 0.12, 0.27, s, s + 40, YELLOW)
    groundQuad(ctx, cam, ROAD_W - 0.27, ROAD_W - 0.12, s, s + 40, PAINT)
  }

  for (let s = Math.floor((cam.cz + 500) / 15) * 15; s >= Math.floor(near / 15) * 15; s -= 15) {
    groundQuad(ctx, cam, 0, ROAD_W, s, s + 0.12, mul(ASPHALT, 0.82))
  }

  const P = 12.2
  for (let s = Math.floor(Math.min(zFar, cam.cz + 700) / P) * P; s >= Math.floor(near / P) * P; s -= P) {
    for (let k = 1; k < LANES; k += 1) {
      groundQuad(ctx, cam, k * LANE_W - 0.075, k * LANE_W + 0.075, s, s + 3.05, PAINT)
    }
  }

  const fade = ctx.createLinearGradient(0, horizon, 0, horizon + H * 0.08)
  fade.addColorStop(0, css(FOG, 0.95))
  fade.addColorStop(1, css(FOG, 0))
  ctx.fillStyle = fade
  ctx.fillRect(0, horizon, W, H * 0.08)
}

function drawBarriers(ctx, cam) {
  const near = cam.cz + 4
  const zFar = cam.cz + 900
  for (let s = Math.floor(zFar / 20) * 20; s >= Math.floor(near / 20) * 20; s -= 20) {
    const a = proj(cam, [-1.4, 0, s])
    const b = proj(cam, [-1.4, 0, s + 20])
    const c = proj(cam, [-1.55, 0.82, s + 20])
    const d = proj(cam, [-1.55, 0.82, s])
    const e = proj(cam, [-1.9, 0.82, s + 20])
    const f = proj(cam, [-1.9, 0.82, s])
    if (!a || !b || !c || !d || !e || !f) continue
    const dz = (a[2] + b[2]) / 2
    path(ctx, [a, b, c, d])
    ctx.fillStyle = css(fogged(mul(CONCRETE, 0.92), dz))
    ctx.fill()
    path(ctx, [d, c, e, f])
    ctx.fillStyle = css(fogged(mul(CONCRETE, 1.08), dz))
    ctx.fill()
    ctx.strokeStyle = css(fogged(mul(CONCRETE, 0.7), dz), 0.6)
    ctx.lineWidth = 0.6
    ctx.beginPath()
    ctx.moveTo(a[0], a[1])
    ctx.lineTo(d[0], d[1])
    ctx.stroke()
  }

  const rx = ROAD_W + 3.4
  for (let s = Math.floor(zFar / 20) * 20; s >= Math.floor(near / 20) * 20; s -= 20) {
    for (let p = 16; p >= 0; p -= 4) {
      const z = s + p
      const a = proj(cam, [rx + 0.05, 0, z])
      const b = proj(cam, [rx + 0.05, 0.75, z])
      if (!a || !b) continue
      ctx.strokeStyle = css(fogged(rgb('#6d7178'), a[2]))
      ctx.lineWidth = Math.max(1, (cam.f * 0.12) / a[2])
      ctx.beginPath()
      ctx.moveTo(a[0], a[1])
      ctx.lineTo(b[0], b[1])
      ctx.stroke()
    }
    const a = proj(cam, [rx, 0.52, s])
    const b = proj(cam, [rx, 0.52, s + 20])
    const c = proj(cam, [rx, 0.82, s + 20])
    const d = proj(cam, [rx, 0.82, s])
    if (!a || !b || !c || !d) continue
    path(ctx, [a, b, c, d])
    ctx.fillStyle = css(fogged(STEEL, (a[2] + b[2]) / 2))
    ctx.fill()
    ctx.strokeStyle = css(fogged(mul(STEEL, 0.7), a[2]), 0.7)
    ctx.lineWidth = 0.6
    ctx.stroke()
  }
}

function sceneryObjects(cam, list) {
  const z0 = cam.cz + 10
  const z1 = cam.cz + 900
  const CELL = 11
  for (let i = Math.floor(z0 / CELL); i < z1 / CELL; i += 1) {
    for (const side of [-1, 1]) {
      for (let k = 0; k < 2; k += 1) {
        const seed = i * 7.13 + side * 3.7 + k * 13.1
        if (hash(seed) < 0.28) continue
        const off = 7 + hash(seed + 1) ** 1.6 * 70
        const x = side < 0 ? -2 - off : ROAD_W + 4.5 + off
        const z = i * CELL + hash(seed + 2) * CELL
        const h = 6 + hash(seed + 3) * 8
        const pine = hash(seed + 4) < 0.4
        const tint = hash(seed + 5)
        const p = proj(cam, [x, 0, z])
        if (!p || p[0] < -200 || p[0] > cam.W + 200) continue
        list.push({ d: p[2], draw: (ctx) => drawTree(ctx, cam, x, z, h, pine, tint) })
      }
    }
  }

  for (let z = Math.ceil(z0 / 64) * 64; z < z1; z += 64) {
    const x = ROAD_W + 4.2
    const p = proj(cam, [x, 0, z])
    if (p) list.push({ d: p[2], draw: (ctx) => drawPole(ctx, cam, x, z) })
  }

  for (let z = Math.ceil(z0 / 820) * 820 + 300; z < z1; z += 820) {
    const p = proj(cam, [ROAD_W / 2, 0, z])
    if (p) list.push({ d: p[2] + 2, draw: (ctx) => drawGantry(ctx, cam, z) })
  }
}

function drawTree(ctx, cam, x, z, h, pine, tint) {
  const base = proj(cam, [x, 0, z])
  if (!base) return
  const d = base[2]
  const px = cam.f / d
  const trunk = fogged(rgb('#6b4a2f'), d)
  const leaf = mix(rgb('#2f6e3a'), rgb('#4f8f3e'), tint)
  ctx.fillStyle = 'rgba(20,40,20,0.25)'
  ctx.beginPath()
  ctx.ellipse(base[0] + px * 0.8, base[1], px * h * 0.28, px * h * 0.06, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = css(trunk)
  const tw = Math.max(1, px * 0.35)
  const trunkTop = proj(cam, [x, h * (pine ? 0.25 : 0.45), z])
  ctx.fillRect(base[0] - tw / 2, trunkTop[1], tw, base[1] - trunkTop[1])
  if (pine) {
    for (let i = 0; i < 3; i += 1) {
      const y0 = proj(cam, [x, h * (0.2 + i * 0.22), z])[1]
      const y1 = proj(cam, [x, h * (0.55 + i * 0.22), z])[1]
      const half = px * h * (0.24 - i * 0.05)
      ctx.beginPath()
      ctx.moveTo(base[0] - half, y0)
      ctx.lineTo(base[0], y1 - (y0 - y1) * 0.25)
      ctx.lineTo(base[0] + half, y0)
      ctx.closePath()
      ctx.fillStyle = css(fogged(mul(leaf, 0.82 + i * 0.08), d))
      ctx.fill()
    }
    return
  }
  const r = px * h * 0.3
  const cy = proj(cam, [x, h * 0.66, z])[1]
  ctx.fillStyle = css(fogged(mul(leaf, 0.78), d))
  ctx.beginPath()
  ctx.arc(base[0], cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = css(fogged(mul(leaf, 1.0), d))
  ctx.beginPath()
  ctx.arc(base[0] - r * 0.25, cy - r * 0.2, r * 0.72, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = css(fogged(mul(leaf, 1.22), d))
  ctx.beginPath()
  ctx.arc(base[0] - r * 0.4, cy - r * 0.38, r * 0.35, 0, Math.PI * 2)
  ctx.fill()
}

function drawPole(ctx, cam, x, z) {
  const a = proj(cam, [x, 0, z])
  const b = proj(cam, [x, 10, z])
  const c = proj(cam, [x - 2.6, 10.3, z])
  if (!a || !b || !c) return
  const d = a[2]
  ctx.strokeStyle = css(fogged(rgb('#8c939b'), d))
  ctx.lineCap = 'round'
  ctx.lineWidth = Math.max(1, (cam.f * 0.2) / d)
  ctx.beginPath()
  ctx.moveTo(a[0], a[1])
  ctx.lineTo(b[0], b[1])
  ctx.lineTo(c[0], c[1])
  ctx.stroke()
  ctx.fillStyle = css(fogged(rgb('#5b6168'), d))
  const lw = (cam.f * 0.7) / d
  ctx.fillRect(c[0] - lw / 2, c[1] - lw * 0.1, lw, lw * 0.25)
  ctx.lineCap = 'butt'
}

function drawGantry(ctx, cam, z) {
  const posts = [-2.6, ROAD_W + 3.9]
  for (const x of posts) {
    drawSolid(ctx, cam, box(0.18, 0, 7.4, -0.18, 0.18).map((v) => [v[0] + x, v[1], v[2] + z]), { color: STEEL })
  }
  drawSolid(ctx, cam, box((ROAD_W + 6.5) / 2, 6.6, 7.2, -0.25, 0.25).map((v) => [v[0] + ROAD_W / 2 + 0.65, v[1], v[2] + z]), { color: STEEL })
  const x0 = LANE_W * 2 + 0.2
  const x1 = ROAD_W - 0.4
  const tl = proj(cam, [x0, 9.6, z - 0.3])
  const tr = proj(cam, [x1, 9.6, z - 0.3])
  const bl = proj(cam, [x0, 7.0, z - 0.3])
  const br = proj(cam, [x1, 7.0, z - 0.3])
  if (!tl || !tr || !bl || !br) return
  const d = tl[2]
  path(ctx, [tl, tr, br, bl])
  ctx.fillStyle = css(fogged(rgb('#14784a'), d))
  ctx.fill()
  ctx.save()
  ctx.transform((tr[0] - tl[0]) / 100, (tr[1] - tl[1]) / 100, (bl[0] - tl[0]) / 36, (bl[1] - tl[1]) / 36, tl[0], tl[1])
  ctx.strokeStyle = css(fogged(rgb('#f2f2ec'), d))
  ctx.lineWidth = 1.2
  ctx.strokeRect(2, 2, 96, 32)
  ctx.fillStyle = css(fogged(rgb('#f2f2ec'), d))
  ctx.font = 'bold 11px Helvetica, Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('LINK ROAD', 50, 16)
  ctx.font = 'bold 7px Helvetica, Arial, sans-serif'
  ctx.fillText('NEXT EXIT  1 MILE', 50, 28)
  ctx.restore()
}

/* ---------- hazards ---------- */

function drawPothole(ctx, cam, h) {
  const pts = []
  const rim = []
  for (let i = 0; i < 14; i += 1) {
    const a = (i / 14) * Math.PI * 2
    const k = 0.75 + hash(h.seed + i) * 0.35
    pts.push(proj(cam, [h.x + Math.cos(a) * 0.75 * k, 0.01, h.z + Math.sin(a) * 0.85 * k]))
    rim.push(proj(cam, [h.x + Math.cos(a) * 0.95 * k, 0.01, h.z + Math.sin(a) * 1.05 * k]))
  }
  if (pts.some((p) => !p) || rim.some((p) => !p)) return
  const d = pts[0][2]
  path(ctx, rim)
  ctx.fillStyle = css(fogged(rgb('#5e626a'), d))
  ctx.fill()
  path(ctx, pts)
  ctx.fillStyle = css(fogged(rgb('#1b1d21'), d))
  ctx.fill()
  const q = proj(cam, [h.x - 0.2, 0.01, h.z + 0.25])
  if (q) {
    ctx.fillStyle = css(fogged(rgb('#3b4552'), d), 0.8)
    ctx.beginPath()
    ctx.ellipse(q[0], q[1], (cam.f * 0.3) / d, (cam.f * 0.08) / d, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

function debrisObjects(cam, h, list) {
  const p = proj(cam, [h.x, 0, h.z])
  if (!p) return
  list.push({
    d: p[2],
    draw: (ctx) => {
      for (let i = 0; i < 7; i += 1) {
        const sx = h.x + (hash(h.seed + i) - 0.5) * 2.6
        const sz = h.z + (hash(h.seed + i + 9) - 0.5) * 2.4
        groundQuad(ctx, cam, sx - 0.12, sx + 0.12, sz - 0.08, sz + 0.08, rgb('#9aa0a8'), 0.01)
      }
      const tire = proj(cam, [h.x - 0.6, 0.15, h.z - 0.4])
      if (tire) {
        const r = (cam.f * 0.36) / tire[2]
        ctx.fillStyle = css(fogged(TIRE, tire[2]))
        ctx.beginPath()
        ctx.ellipse(tire[0], tire[1], r, r * 0.42, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = css(fogged(rgb('#3a3d44'), tire[2]))
        ctx.beginPath()
        ctx.ellipse(tire[0], tire[1] - r * 0.05, r * 0.48, r * 0.2, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      const place = poseFn({ x: h.x + 0.5, z: h.z + 0.3, yaw: 0.5 })
      drawSolid(ctx, cam, box(0.42, 0, 0.55, -0.35, 0.35).map((v) => place(v, false)), {
        color: rgb('#a8733f'),
        top: rgb('#c98d50'),
        decals: { top: [{ u0: 0.45, v0: 0, u1: 0.55, v1: 1, color: rgb('#6b4523') }] },
      })
      const place2 = poseFn({ x: h.x + 0.1, z: h.z + 0.9, yaw: -0.3 })
      drawSolid(ctx, cam, box(0.9, 0, 0.08, -0.12, 0.12).map((v) => place2(v, false)), { color: rgb('#7d6448') })
    },
  })
}

function crateObject(cam, h, list) {
  const p = proj(cam, [h.x, 0, h.z])
  if (!p) return
  list.push({
    d: p[2],
    draw: (ctx) =>
      drawSolid(ctx, cam, box(0.7, 0, 0.9, -0.7, 0.7).map((v) => [v[0] + h.x, v[1], v[2] + h.z]), {
        color: rgb('#e9b52c'),
        top: rgb('#f7cf4a'),
        decals: {
          rear: [
            { u0: 0.44, v0: 0.4, u1: 0.56, v1: 0.85, color: rgb('#1c1c24') },
            { u0: 0.44, v0: 0.15, u1: 0.56, v1: 0.3, color: rgb('#1c1c24') },
          ],
        },
      }),
  })
}

function solid(ctx, cam, place, verts, style) {
  drawSolid(ctx, cam, verts.map((v) => place(v, false)), style)
}

function personParts(ctx, cam, place, seed) {
  const shirts = ['#f2742b', '#3b7bd8', '#d8d24a', '#c8423e', '#4aa36b']
  const shirt = rgb(shirts[seed % shirts.length])
  const pants = rgb('#2c3448')
  const skin = rgb(['#e7b98f', '#b77b52', '#8a5a3a'][seed % 3])
  for (const dx of [-0.11, 0.11]) solid(ctx, cam, place, box(0.08, 0, 0.86, -0.1, 0.1).map((v) => [v[0] + dx, v[1], v[2]]), { color: pants })
  solid(ctx, cam, place, box(0.21, 0.84, 1.46, -0.13, 0.13), { color: shirt })
  for (const dx of [-0.27, 0.27]) solid(ctx, cam, place, box(0.06, 0.9, 1.42, -0.07, 0.07).map((v) => [v[0] + dx, v[1], v[2]]), { color: shirt })
  solid(ctx, cam, place, box(0.11, 1.5, 1.75, -0.11, 0.11), { color: skin, top: rgb('#2a211c') })
}

function incidentObjects(cam, h, sim, list) {
  const p = proj(cam, [h.x, 0, h.z])
  if (!p) return
  const model = h.incident?.model
  const t = sim.t
  list.push({
    d: p[2],
    draw: (ctx) => {
      if (!h.incident) {
        const place = poseFn({ x: h.x, z: h.z })
        solid(ctx, cam, place, hexa(0.72, 0, -0.62, 0.62, 0.42, 1.0, -0.36, 0.36), {
          color: rgb('#6f7a8c'),
          top: rgb('#8a95a8'),
          decals: { rear: [{ u0: 0.15, v0: 0.62, u1: 0.85, v1: 0.72, color: rgb('#4c5566') }] },
        })
        return
      }
      if (model === 'person' || model === 'bike') {
        const place = poseFn({ x: h.x, z: h.z })
        if (model === 'bike') {
          const side = poseFn({ x: h.x + 0.45, z: h.z, yaw: Math.PI / 2 })
          for (const dz of [-0.55, 0.55]) solid(ctx, cam, side, box(0.03, 0, 0.66, dz - 0.33, dz + 0.33), { color: TIRE, edge: false })
          solid(ctx, cam, side, box(0.03, 0.4, 0.5, -0.5, 0.5), { color: rgb('#d63b3b') })
        }
        personParts(ctx, cam, place, h.seed)
      } else if (model === 'people') {
        for (let i = 0; i < 3; i += 1) {
          const place = poseFn({ x: h.x + (i - 1) * 0.85, z: h.z + (hash(h.seed + i) - 0.5) * 1.4, yaw: (hash(h.seed + i + 4) - 0.5) * 0.8 })
          personParts(ctx, cam, place, h.seed + i)
        }
      } else if (model === 'animal') {
        const place = poseFn({ x: h.x, z: h.z, yaw: Math.PI / 2 + Math.sin(t * 0.7 + h.seed) * 0.15 })
        const fur = rgb('#9a6a3e')
        for (const [dx, dz] of [[-0.14, -0.62], [0.14, -0.62], [-0.14, 0.62], [0.14, 0.62]]) {
          solid(ctx, cam, place, box(0.05, 0, 0.78, dz - 0.05, dz + 0.05).map((v) => [v[0] + dx, v[1], v[2]]), { color: rgb('#6e4a2a') })
        }
        solid(ctx, cam, place, box(0.22, 0.72, 1.12, -0.8, 0.8), { color: fur, top: rgb('#b07c4c') })
        solid(ctx, cam, place, hexa(0.1, 1.0, 0.62, 0.86, 0.08, 1.42, 0.8, 0.98), { color: fur })
        solid(ctx, cam, place, box(0.1, 1.36, 1.56, 0.82, 1.14), { color: fur, front: rgb('#3a2516') })
      } else if (model === 'crash') {
        const parts = [
          { x: h.x - 0.7, z: h.z - 1.6, yaw: 0.55, kind: 'sedan', color: '#c8423e' },
          { x: h.x + 0.9, z: h.z + 1.7, yaw: -1.05, kind: 'hatch', color: '#8d96a3' },
        ]
        for (let i = 0; i < 9; i += 1) {
          const sx = h.x + (hash(h.seed + i) - 0.5) * 3
          const sz = h.z + (hash(h.seed + i + 9) - 0.5) * 3
          groundQuad(ctx, cam, sx - 0.1, sx + 0.1, sz - 0.07, sz + 0.07, rgb(i % 2 ? '#cfd6de' : '#7a2424'), 0.01)
        }
        for (const part of parts) {
          drawVehicle(ctx, cam, part, part.kind, part.color, { brake: true, signal: 0, hazard: true }, t)
        }
      } else {
        drawSolid(ctx, cam, box(0.7, 0, 0.9, -0.7, 0.7).map((v) => [v[0] + h.x, v[1], v[2] + h.z]), {
          color: rgb('#a8733f'),
          top: rgb('#c98d50'),
          decals: { rear: [{ u0: 0.1, v0: 0.45, u1: 0.9, v1: 0.55, color: rgb('#6b4523') }] },
        })
      }
    },
  })
}

function speedSignObjects(cam, h, sim, list) {
  const p = proj(cam, [h.x, 0, h.z])
  if (!p) return
  let reading = null
  for (const c of sim.cars) {
    const ahead = h.z - c.z
    if (ahead > 0 && ahead < 150 && (reading == null || ahead < reading.ahead)) reading = { ahead, v: c.v }
  }
  list.push({
    d: p[2],
    draw: (ctx) => {
      for (const dx of [-0.45, 0.45]) {
        drawSolid(ctx, cam, box(0.05, 0, 2.4, -0.05, 0.05).map((v) => [v[0] + h.x + dx, v[1], v[2] + h.z]), { color: STEEL, edge: false })
      }
      const panel = (y0, y1, fill, paint) => {
        const tl = proj(cam, [h.x - 0.65, y1, h.z - 0.07])
        const tr = proj(cam, [h.x + 0.65, y1, h.z - 0.07])
        const bl = proj(cam, [h.x - 0.65, y0, h.z - 0.07])
        const br = proj(cam, [h.x + 0.65, y0, h.z - 0.07])
        if (!tl || !tr || !bl || !br) return
        path(ctx, [tl, tr, br, bl])
        ctx.fillStyle = fill
        ctx.fill()
        ctx.save()
        ctx.transform((tr[0] - tl[0]) / 100, (tr[1] - tl[1]) / 100, (bl[0] - tl[0]) / 100, (bl[1] - tl[1]) / 100, tl[0], tl[1])
        paint()
        ctx.restore()
      }
      panel(2.15, 3.55, '#f6f6f2', () => {
        ctx.strokeStyle = '#111'
        ctx.lineWidth = 4
        ctx.strokeRect(6, 6, 88, 88)
        ctx.fillStyle = '#111'
        ctx.textAlign = 'center'
        ctx.font = 'bold 15px Helvetica, Arial, sans-serif'
        ctx.fillText('SPEED', 50, 28)
        ctx.fillText('LIMIT', 50, 45)
        ctx.font = 'bold 40px Helvetica, Arial, sans-serif'
        ctx.fillText('40', 50, 86)
      })
      panel(1.25, 2.05, '#121418', () => {
        ctx.textAlign = 'center'
        ctx.fillStyle = '#ffd34d'
        ctx.font = 'bold 12px Helvetica, Arial, sans-serif'
        ctx.fillText('YOUR SPEED', 50, 22)
        const mph = reading ? Math.round(reading.v * 2.237) : null
        ctx.fillStyle = mph != null && mph > 42 ? '#ff4b3a' : '#7dff6a'
        ctx.font = 'bold 54px "Courier New", monospace'
        ctx.fillText(mph != null ? String(mph) : '--', 50, 88)
      })
    },
  })
}

function vehicleState(c) {
  return {
    brake: c.a < -0.7 || c.v < 0.5,
    signal: Math.sign((c.target ?? (c.commanded ? c.home : c.lane)) - c.lane),
    hazard: false,
  }
}

/* ---------- overlays ---------- */

function ring(ctx, cam, x, z, r, color, alpha, width, dash) {
  const pts = []
  for (let i = 0; i <= 40; i += 1) {
    const a = (i / 40) * Math.PI * 2
    const p = proj(cam, [x + Math.cos(a) * r, 0.03, z + Math.sin(a) * r])
    if (!p) return
    pts.push(p)
  }
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = width
  if (dash) ctx.setLineDash(dash)
  ctx.shadowColor = color
  ctx.shadowBlur = 10
  ctx.beginPath()
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
  ctx.stroke()
  ctx.restore()
}

function drawRings(ctx, cam, sim) {
  for (const c of sim.cars) {
    const r = c.L * 0.5 + 0.9
    if (c.status === 'linked') {
      ring(ctx, cam, c.x, c.z, r, LINK, 0.95, 2.2)
      const ping = (sim.t * 0.8 + c.z * 0.01) % 1
      ring(ctx, cam, c.x, c.z, r + ping * 9, LINK, (1 - ping) * 0.6, 1.5)
    } else if (c.status === 'idle') {
      ring(ctx, cam, c.x, c.z, r, '#ffffff', 0.38, 1.2)
    } else if (c.status === 'quiet') {
      ring(ctx, cam, c.x, c.z, r, '#b6bcc6', 0.55, 1.2, [4, 4])
    }
  }
}

function drawIntents(ctx, cam, sim) {
  for (const c of sim.cars) {
    if (!c.commanded) continue
    const pts = []
    for (let i = 0; i <= 24; i += 1) {
      const u = i / 24
      const ease = u * u * (3 - 2 * u)
      const p = proj(cam, [c.x + (laneCenter(c.home) - c.x) * ease, 0.04, c.z + c.L / 2 + 2 + u * 50])
      if (p) pts.push(p)
    }
    if (pts.length < 2) continue
    ctx.save()
    ctx.strokeStyle = '#ffb21a'
    ctx.lineWidth = 3
    ctx.setLineDash([10, 8])
    ctx.lineDashOffset = -sim.t * 40
    ctx.shadowColor = '#ffb21a'
    ctx.shadowBlur = 10
    ctx.beginPath()
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
    ctx.stroke()
    ctx.restore()
  }
}

function screenBox(cam, h) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const dx of [-h.W / 2, h.W / 2]) {
    for (const dz of [-h.L / 2, h.L / 2]) {
      for (const y of [0, h.H]) {
        const p = proj(cam, [h.x + dx, y, h.z + dz])
        if (!p) return null
        x0 = Math.min(x0, p[0])
        y0 = Math.min(y0, p[1])
        x1 = Math.max(x1, p[0])
        y1 = Math.max(y1, p[1])
      }
    }
  }
  const pad = 3
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 }
}

function brackets(ctx, b, color, k) {
  const len = Math.max(4, Math.min(b.w, b.h) * k)
  ctx.beginPath()
  for (const [x, y, sx, sy] of [[b.x, b.y, 1, 1], [b.x + b.w, b.y, -1, 1], [b.x, b.y + b.h, 1, -1], [b.x + b.w, b.y + b.h, -1, -1]]) {
    ctx.moveTo(x + sx * len, y)
    ctx.lineTo(x, y)
    ctx.lineTo(x, y + sy * len)
  }
  ctx.strokeStyle = color
  ctx.stroke()
}

function drawScans(ctx, cam, sim) {
  for (const h of sim.hazards) {
    if (h.kind !== 'footage') continue
    const b = screenBox(cam, h)
    if (h.state === 'pending') {
      const pulse = 0.5 + 0.5 * Math.sin(sim.t * 4)
      ring(ctx, cam, h.x, h.z, 2.2 + pulse * 0.6, '#ffb21a', 0.5 + pulse * 0.3, 1.6, [5, 5])
      continue
    }
    if (h.state === 'scanning') {
      const c = sim.cars.find((o) => o.id === h.scanner)
      if (c) {
        const nose = c.z + c.L / 2
        const pts = [
          proj(cam, [c.x - 0.6, 0.05, nose]),
          proj(cam, [h.x - 2.4, 0.05, h.z]),
          proj(cam, [h.x + 2.4, 0.05, h.z]),
          proj(cam, [c.x + 0.6, 0.05, nose]),
        ]
        if (pts.every(Boolean)) {
          ctx.save()
          path(ctx, pts)
          ctx.fillStyle = 'rgba(63,242,255,0.16)'
          ctx.fill()
          const u = (sim.t * 1.4) % 1
          const zs = nose + (h.z - nose) * u
          const xs = c.x + (h.x - c.x) * u
          const half = 0.6 + 1.8 * u
          const a = proj(cam, [xs - half, 0.06, zs])
          const e = proj(cam, [xs + half, 0.06, zs])
          if (a && e) {
            ctx.strokeStyle = 'rgba(63,242,255,0.9)'
            ctx.lineWidth = 2
            ctx.shadowColor = LINK
            ctx.shadowBlur = 10
            ctx.beginPath()
            ctx.moveTo(a[0], a[1])
            ctx.lineTo(e[0], e[1])
            ctx.stroke()
          }
          ctx.restore()
        }
      }
      if (b) {
        ctx.save()
        ctx.lineWidth = 2
        ctx.setLineDash([4, 3])
        ctx.lineDashOffset = -sim.t * 20
        ctx.strokeStyle = LINK
        ctx.strokeRect(b.x, b.y, b.w, b.h)
        ctx.restore()
      }
      continue
    }
    if (!b || !h.incident) continue
    const color = h.scope === 'road' ? '#ffd34d' : '#3ff2ff'
    ctx.save()
    ctx.lineWidth = 2
    ctx.shadowColor = color
    ctx.shadowBlur = 6
    brackets(ctx, b, color, 0.3)
    ctx.shadowBlur = 0
    const label = `${h.incident.label} ${Math.round(h.incident.confidence * 100)}%`
    ctx.font = '7px "Press Start 2P", monospace'
    const w = ctx.measureText(label).width + 8
    ctx.fillStyle = color
    ctx.fillRect(b.x, b.y + b.h + 2, w, 12)
    ctx.fillStyle = '#1c1c24'
    ctx.textBaseline = 'top'
    ctx.fillText(label, b.x + 4, b.y + b.h + 5)
    ctx.restore()
  }
}

function drawHover(ctx, cam, hover, t) {
  if (!hover) return
  const color = hover.scope === 'road' ? [255, 211, 77] : [63, 242, 255]
  const pulse = 0.22 + 0.1 * Math.sin(t * 8)
  const lane = laneAt(hover.x)
  ctx.save()
  if (hover.scope === 'road') {
    ctx.globalAlpha = pulse + 0.1
    groundQuad(ctx, cam, 0, ROAD_W, hover.z - 2.5, hover.z + 2.5, color, 0.02)
  } else {
    ctx.globalAlpha = pulse
    groundQuad(ctx, cam, lane * LANE_W, (lane + 1) * LANE_W, hover.z - 3, hover.z + 40, color, 0.02)
  }
  ctx.restore()
  const x = hover.scope === 'road' ? hover.x : laneCenter(lane)
  ring(ctx, cam, x, hover.z, 1.6 + 0.3 * Math.sin(t * 8), css(color), 0.9, 2)
}

function anchor(sim, ref) {
  if (ref.car) {
    const c = sim.cars.find((o) => o.id === ref.car)
    return c ? [c.x, c.H + 0.5, c.z] : null
  }
  const h = sim.hazards.find((o) => o.id === ref.hazard)
  return h ? [h.x, Math.max(1.2, h.H + 0.3), h.z] : null
}

function drawLinks(ctx, cam, sim) {
  if (sim.link) {
    ctx.save()
    ctx.setLineDash([6, 6])
    ctx.lineDashOffset = -sim.t * 30
    for (let i = 0; i < sim.cars.length; i += 1) {
      for (let j = i + 1; j < sim.cars.length; j += 1) {
        const a = sim.cars[i]
        const b = sim.cars[j]
        if (Math.abs(a.z - b.z) > 60 || Math.abs(carLane(a) - carLane(b)) > 1) continue
        const pa = proj(cam, [a.x, a.H + 0.3, a.z])
        const pb = proj(cam, [b.x, b.H + 0.3, b.z])
        if (!pa || !pb) continue
        const hot = a.status === 'linked' && b.status === 'linked'
        ctx.strokeStyle = hot ? 'rgba(63,242,255,0.75)' : 'rgba(255,255,255,0.32)'
        ctx.lineWidth = hot ? 1.8 : 1
        ctx.beginPath()
        ctx.moveTo(pa[0], pa[1])
        ctx.lineTo(pb[0], pb[1])
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  for (const arc of sim.arcs) {
    const age = sim.t - arc.t0
    if (age < 0) continue
    const a = anchor(sim, arc.from)
    const b = anchor(sim, { car: arc.to })
    if (!a || !b) continue
    const span = Math.hypot(b[0] - a[0], b[2] - a[2])
    const apex = Math.max(a[1], b[1]) + 2 + span * 0.08
    const ctrl = [(a[0] + b[0]) / 2, apex, (a[2] + b[2]) / 2]
    const at = (u) => {
      const k = 1 - u
      return [k * k * a[0] + 2 * k * u * ctrl[0] + u * u * b[0], k * k * a[1] + 2 * k * u * ctrl[1] + u * u * b[1], k * k * a[2] + 2 * k * u * ctrl[2] + u * u * b[2]]
    }
    const p = Math.min(1, age / 0.7)
    const fade = age < 0.7 ? 1 : Math.max(0, 1 - (age - 0.7) / 1.1)
    const color = ARC[arc.kind] || LINK
    ctx.save()
    ctx.globalAlpha = fade
    ctx.strokeStyle = color
    ctx.lineWidth = 2.4
    ctx.shadowColor = color
    ctx.shadowBlur = 12
    ctx.beginPath()
    for (let i = 0; i <= 24; i += 1) {
      const s = proj(cam, at((i / 24) * p))
      if (!s) continue
      if (i === 0) ctx.moveTo(s[0], s[1])
      else ctx.lineTo(s[0], s[1])
    }
    ctx.stroke()
    ctx.restore()
    if (p < 1) {
      const s = proj(cam, at(p))
      if (s) pokeball(ctx, s[0], s[1], 5)
    }
  }
}

function pokeball(ctx, x, y, r) {
  ctx.save()
  ctx.lineWidth = 1.4
  ctx.strokeStyle = '#141414'
  ctx.fillStyle = '#f4f4f4'
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#e8353b'
  ctx.beginPath()
  ctx.arc(x, y, r, Math.PI, 0)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.moveTo(x - r, y)
  ctx.lineTo(x + r, y)
  ctx.stroke()
  ctx.fillStyle = '#f4f4f4'
  ctx.beginPath()
  ctx.arc(x, y, r * 0.35, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function tag(ctx, x, y, text, sub, opts = {}) {
  ctx.save()
  ctx.font = '8px "Press Start 2P", monospace'
  const w = Math.max(ctx.measureText(text).width, sub ? ctx.measureText(sub).width : 0) + 12
  const h = sub ? 26 : 16
  const left = Math.round(x - w / 2)
  const top = Math.round(y - h - 6)
  ctx.fillStyle = opts.fill || '#fbf8ec'
  ctx.strokeStyle = '#1c1c24'
  ctx.lineWidth = 2
  ctx.fillRect(left, top, w, h)
  ctx.strokeRect(left + 1, top + 1, w - 2, h - 2)
  ctx.beginPath()
  ctx.moveTo(x - 4, top + h)
  ctx.lineTo(x, top + h + 5)
  ctx.lineTo(x + 4, top + h)
  ctx.fillStyle = opts.fill || '#fbf8ec'
  ctx.fill()
  ctx.fillStyle = '#1c1c24'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(text, x, top + 5)
  if (sub) {
    ctx.fillStyle = '#6a6a78'
    ctx.fillText(sub, x, top + 15)
  }
  if (opts.dot) {
    ctx.fillStyle = opts.dot
    ctx.fillRect(left + 4, top + 5, 4, 6)
  }
  ctx.restore()
}

function drawTags(ctx, cam, sim) {
  for (const h of sim.hazards) {
    if (h.cleared) continue
    const p = proj(cam, [h.x, (h.vehicle ? h.H : h.sign ? 3.6 : Math.max(0.8, h.H)) + 0.6, h.z])
    if (!p || p[1] < 20) continue
    if (h.state === 'pending') {
      tag(ctx, p[0], p[1], '? UNKNOWN', `LANE ${h.lane + 1} · UNSEEN`, { fill: '#e2e2dc' })
    } else if (h.state === 'scanning') {
      const who = sim.cars.find((c) => c.id === h.scanner)?.short ?? ''
      const dots = '.'.repeat(1 + (Math.floor(sim.t * 4) % 3))
      tag(ctx, p[0], p[1], `SCANNING${dots.padEnd(3)}`, `${who} · YOLO`, { fill: '#9ff6ff' })
    } else {
      tag(ctx, p[0], p[1], `! ${h.label}`, h.scope === 'road' ? 'ROAD' : `LANE ${h.lane + 1}`, {
        fill: h.scope === 'road' ? '#ffe27a' : '#9ff6ff',
      })
    }
  }
  for (const c of sim.cars) {
    const p = proj(cam, [c.x, c.H + 0.5, c.z])
    if (!p) continue
    const dot =
      c.status === 'linked' ? '#16c8d8' : c.status === 'quiet' ? '#9aa0aa' : c.status === 'solo' ? '#e0a020' : '#5dc85d'
    tag(ctx, p[0], p[1], ` ${c.short}`, null, { dot, fill: c.status === 'quiet' ? '#e2e2dc' : undefined })
  }
}

/* ---------- frame ---------- */

export function render(ctx, sim, W, H, hover) {
  const cam = makeCam(sim, W, H)
  const t = sim.t
  ctx.clearRect(0, 0, W, H)
  drawSky(ctx, cam, t)
  drawGround(ctx, cam)
  drawBarriers(ctx, cam)

  for (const h of sim.hazards) if (h.kind === 'pothole') drawPothole(ctx, cam, h)
  for (const c of sim.cars) drawShadow(ctx, cam, c.x, c.z, c.L, c.W, c.yaw)
  for (const h of sim.hazards) if (h.vehicle) drawShadow(ctx, cam, h.x, h.z, h.L, h.W)
  drawRings(ctx, cam, sim)
  drawIntents(ctx, cam, sim)
  drawHover(ctx, cam, hover, t)

  const list = []
  sceneryObjects(cam, list)
  for (const c of sim.cars) {
    const p = proj(cam, [c.x, 0, c.z])
    if (!p) continue
    const pose = {
      x: c.x,
      z: c.z,
      yaw: c.yaw,
      pitch: Math.max(-0.035, Math.min(0.035, c.a * 0.006)),
      roll: Math.max(-0.04, Math.min(0.04, -c.latAcc * 0.012)),
    }
    list.push({ d: p[2], draw: (g) => drawVehicle(g, cam, pose, c.kind, c.color, vehicleState(c), t) })
  }
  for (const h of sim.hazards) {
    if (h.vehicle) {
      const p = proj(cam, [h.x, 0, h.z])
      if (!p) continue
      const state = { brake: h.v < 0.5, signal: 0, hazard: h.kind !== 'police' }
      list.push({ d: p[2], draw: (g) => drawVehicle(g, cam, { x: h.x, z: h.z }, h.vehicle, h.color, state, t) })
    } else if (h.kind === 'debris') {
      debrisObjects(cam, h, list)
    } else if (h.sign) {
      speedSignObjects(cam, h, sim, list)
    } else if (h.kind === 'custom-road') {
      crateObject(cam, h, list)
    } else if (h.kind === 'footage') {
      incidentObjects(cam, h, sim, list)
    }
  }
  list.sort((a, b) => b.d - a.d)
  for (const item of list) item.draw(ctx)

  drawScans(ctx, cam, sim)
  drawLinks(ctx, cam, sim)
  drawTags(ctx, cam, sim)
  return cam
}
