import { useEffect, useRef, useState } from 'react'
import { INTRO, ITEMS } from './cast.js'
import { parseCommand } from './commands.js'
import IncidentCard from './IncidentCard.jsx'
import Scene from './Scene.jsx'
import { ItemSprite } from './sprites.jsx'
import {
  ROAD_W,
  addHazard,
  commandLane,
  createSim,
  dropZ,
  laneAt,
  laneCenter,
  leadZ,
  resolveHazard,
} from './sim/world.js'
import {
  askClip,
  getHealth,
  getTraces,
  ingestClip,
  runAgent,
  scanClip,
  searchClips,
} from './stack/api.js'
import SearchPanel from './stack/SearchPanel.jsx'
import StackHud from './stack/StackHud.jsx'
import { UNREADABLE, classify } from './vision/incident.js'
import { analyzeMedia, loadModel } from './vision/yolo.js'
import { speak, stopSpeaking, voiceSupported } from './voice.js'

let audioCtx

function blip(freq = 680, duration = 0.045) {
  try {
    audioCtx = audioCtx || new AudioContext()
    if (audioCtx.state === 'suspended') audioCtx.resume()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'square'
    osc.frequency.value = freq
    gain.gain.value = 0.025
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start()
    osc.stop(audioCtx.currentTime + duration)
  } catch {
    /* sound is optional */
  }
}

function encounterChime() {
  ;[523, 659, 784].forEach((freq, index) => {
    setTimeout(() => blip(freq, 0.08), index * 90)
  })
}

const STATUS = {
  linked: 'LINKED',
  idle: 'READY',
  quiet: 'QUIET',
  solo: 'SOLO',
}

const spriteFor = (item) => (item.kind === 'footage' ? 'footage' : item.id)

function snapshot(sim) {
  const linked = {}
  for (const h of sim.hazards) {
    if (h.kind !== 'footage') continue
    linked[h.id] = sim.cars.filter((c) => c.known.get(h.id) === 'link').map((c) => c.short)
  }
  return {
    link: sim.link,
    linked,
    stats: { ...sim.stats },
    cars: sim.cars.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      status: c.status,
      note: c.note,
      mph: Math.round(c.v * 2.237),
      comfort: c.comfort,
      lane: c.target ?? c.lane,
    })),
  }
}

export default function App() {
  const simRef = useRef(null)
  if (!simRef.current) simRef.current = createSim(true)
  const hoverRef = useRef(null)
  const sceneRef = useRef(null)
  const dragRef = useRef(null)
  const queueRef = useRef([...INTRO])
  const currentRef = useRef(null)
  const namingRef = useRef(false)
  const doneAtRef = useRef(null)
  const voiceRef = useRef(voiceSupported)
  const speakingRef = useRef(false)
  const spokenAtRef = useRef(0)
  const speechTokenRef = useRef(0)

  const [view, setView] = useState(() => snapshot(simRef.current))
  const [current, setCurrent] = useState(null)
  const [typed, setTyped] = useState('')
  const [ghost, setGhost] = useState(null)
  const [flash, setFlash] = useState(false)
  const [naming, setNaming] = useState(false)
  const [draft, setDraft] = useState('')
  const [extras, setExtras] = useState([])
  const [command, setCommand] = useState('')
  const [voiceOn, setVoiceOn] = useState(voiceSupported)
  const [report, setReport] = useState(null)
  const [health, setHealth] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [hits, setHits] = useState([])
  const [searching, setSearching] = useState(false)
  const [traces, setTraces] = useState([])
  const fileRef = useRef(null)
  const uploadsRef = useRef(0)
  const alertedRef = useRef(new Map())
  const extrasRef = useRef([])

  const shown = current ? (current.speaker ? `${current.speaker}: ${current.text}` : current.text) : ''
  const done = shown.length > 0 && typed === shown

  useEffect(() => {
    const id = setInterval(() => {
      const sim = simRef.current
      for (const job of sim.scans.splice(0)) runScan(sim, job)
      if (sim.events.length) {
        queueRef.current.push(...sim.events.splice(0))
        if (queueRef.current.length > 5) queueRef.current = queueRef.current.slice(-5)
      }
      const next = snapshot(sim)
      for (const [id, names] of Object.entries(next.linked)) {
        const seen = alertedRef.current.get(Number(id)) ?? new Set()
        for (const n of names) seen.add(n)
        alertedRef.current.set(Number(id), seen)
      }
      setView(next)
      const pause = voiceRef.current ? 450 : 1300
      const finished = doneAtRef.current != null && !speakingRef.current
      const ready = finished && performance.now() - Math.max(doneAtRef.current, spokenAtRef.current) > pause
      if (queueRef.current.length && (!currentRef.current || ready) && !namingRef.current) {
        doneAtRef.current = null
        setCurrent(queueRef.current.shift())
      }
    }, 200)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    extrasRef.current = extras
  }, [extras])

  useEffect(() => {
    currentRef.current = current
    namingRef.current = naming
    voiceRef.current = voiceOn
  }, [current, naming, voiceOn])

  useEffect(() => {
    let alive = true
    const tick = () => {
      getHealth()
        .then((data) => {
          if (alive) setHealth(data)
        })
        .catch(() => {
          if (alive) setHealth(null)
        })
      getTraces()
        .then((data) => {
          if (alive) setTraces(data.traces || [])
        })
        .catch(() => {})
    }
    tick()
    const id = setInterval(tick, 4000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  useEffect(() => {
    if (shown && done && doneAtRef.current == null) doneAtRef.current = performance.now()
  }, [shown, done])

  useEffect(() => {
    setTyped('')
    if (!shown) return undefined
    let count = 0
    const id = setInterval(() => {
      count += 1
      setTyped(shown.slice(0, count))
      if (!voiceRef.current && count % 3 === 1) blip(720, 0.018)
      if (count >= shown.length) clearInterval(id)
    }, 22)
    return () => clearInterval(id)
  }, [shown])

  useEffect(() => {
    if (!current || !voiceOn) return undefined
    const token = ++speechTokenRef.current
    speakingRef.current = true
    speak(current.speaker, current.text).then(() => {
      if (token !== speechTokenRef.current) return
      speakingRef.current = false
      spokenAtRef.current = performance.now()
    })
    return () => {
      speechTokenRef.current += 1
      speakingRef.current = false
      stopSpeaking()
    }
  }, [current, voiceOn])

  function interrupt() {
    queueRef.current = []
    doneAtRef.current = 0
    spokenAtRef.current = 0
    speechTokenRef.current += 1
    speakingRef.current = false
    stopSpeaking()
  }

  function say(text) {
    doneAtRef.current = null
    setCurrent({ speaker: null, text })
  }

  function encounter() {
    setFlash(true)
    encounterChime()
    setTimeout(() => setFlash(false), 450)
  }

  function runScan(sim, job) {
    const car = sim.cars.find((c) => c.id === job.car)
    setReport({ id: job.hazard, status: 'scanning', car: car.short, color: car.color, lane: job.lane, media: job.media, progress: { frames: 0, total: 0 } })
    blip(990, 0.05)
    analyzeMedia(job.media, (progress) => {
      setReport((r) => (r?.id === job.hazard && r.status === 'scanning' ? { ...r, progress } : r))
    })
      .then(async (result) => {
        let incident = classify(result.detections)
        let cosmos = null
        let provider = 'yolo'
        try {
          const fused = await scanClip({
            clipId: job.media.clipId,
            detections: result.detections,
            time: result.time,
            frame: result.frame,
          })
          if (fused?.incident) incident = fused.incident
          cosmos = fused?.cosmos || null
          provider = fused?.provider || provider
        } catch {
          /* YOLO-only fallback */
        }
        return { result, incident, cosmos, provider }
      })
      .then(
        (payload) => payload,
        (err) => ({ result: null, incident: UNREADABLE, error: err?.message || 'SCAN FAILED' }),
      )
      .then(({ result, incident, error, cosmos, provider }) => {
        if (simRef.current !== sim || !resolveHazard(sim, job.hazard, incident)) return
        encounterChime()
        setReport((r) => (r?.id === job.hazard ? { ...r, status: 'done', result, incident, error, cosmos, provider } : r))
      })
  }

  function upload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const type = file.type.startsWith('video') ? 'video' : file.type.startsWith('image') ? 'image' : null
    if (!type) {
      say('THAT FILE IS NOT A VIDEO OR A PHOTO.')
      return
    }
    uploadsRef.current += 1
    const name = file.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/gi, ' ').trim().toUpperCase().slice(0, 10)
    const localId = `footage-${uploadsRef.current}`
    const item = {
      id: localId,
      kind: 'footage',
      label: name || 'FOOTAGE',
      scope: 'scan',
      media: { type, url: URL.createObjectURL(file), name: file.name },
    }
    setExtras((list) => [...list, item])
    loadModel().catch(() => {})
    interrupt()
    say(`${item.label} IS IN THE BAG. DROP IT IN A LANE, OR SEARCH FOR A MOMENT.`)
    blip(880, 0.06)

    const durationPromise =
      type === 'video'
        ? new Promise((resolve) => {
            const video = document.createElement('video')
            video.preload = 'metadata'
            video.onloadedmetadata = () => resolve(Number.isFinite(video.duration) ? video.duration : 0)
            video.onerror = () => resolve(0)
            video.src = item.media.url
          })
        : Promise.resolve(0)

    durationPromise.then((duration) =>
      ingestClip(file, { duration }).then(async (ingested) => {
        const clipId = ingested.clip?.id
        setExtras((list) =>
          list.map((entry) =>
            entry.id === localId ? { ...entry, clipId, media: { ...entry.media, clipId } } : entry,
          ),
        )
        try {
          const result = await analyzeMedia(item.media)
          await scanClip({ clipId, detections: result.detections, time: result.time, frame: result.frame })
        } catch {
          /* search index can wait until a car scans */
        }
        getTraces()
          .then((data) => setTraces(data.traces || []))
          .catch(() => {})
      }).catch(() => {
        say('INGEST IS OFFLINE. YOLO SCAN STILL WORKS WHEN YOU DROP THE CLIP.')
      }),
    )
  }

  useEffect(() => {
    const locate = (event) => {
      const point = sceneRef.current?.toRoad(event.clientX, event.clientY)
      if (!point || point.x < -0.6 || point.x > ROAD_W + 0.6) return null
      return point
    }
    const move = (event) => {
      const item = dragRef.current
      if (!item) return
      const point = locate(event)
      const sim = simRef.current
      const z = point ? dropZ(sim, point.z, item.kind) : 0
      hoverRef.current = point ? { x: point.x, z, scope: item.scope } : null
      let hint = 'DROP ON THE ROAD'
      if (point) {
        const where = item.scope === 'road' ? 'ALL LANES' : `LANE ${laneAt(point.x) + 1}`
        hint = `${where} · ${Math.round(z - leadZ(sim))} M AHEAD`
      }
      setGhost((g) => (g ? { ...g, x: event.clientX, y: event.clientY, hint } : g))
    }
    const up = (event) => {
      const item = dragRef.current
      if (!item) return
      dragRef.current = null
      hoverRef.current = null
      setGhost(null)
      const point = locate(event)
      if (!point) return
      interrupt()
      addHazard(simRef.current, item, point.x, point.z)
      encounter()
    }
    const cancel = () => {
      dragRef.current = null
      hoverRef.current = null
      setGhost(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
    }
  }, [])

  function arm(item, event) {
    event.preventDefault()
    blip(520, 0.04)
    dragRef.current = item
    setGhost({ ...item, x: event.clientX, y: event.clientY, hint: 'DROP ON THE ROAD' })
  }

  function findMoments(text) {
    const q = text.trim()
    if (!q) return
    setSearchQuery(q)
    setSearching(true)
    searchClips(q)
      .then((data) => {
        setHits(data.hits || [])
        interrupt()
        const n = data.hits?.length || 0
        const archive = (data.hits || []).some((hit) => hit.provider === 'vast')
        say(
          n
            ? `FOUND ${n} MOMENT${n === 1 ? '' : 'S'}${archive ? ' IN THE ARCHIVE' : ''}. DROP ONE ON THE ROAD.`
            : 'NO MATCHING MOMENTS YET. UPLOAD FOOTAGE FIRST.',
        )
      })
      .catch(() => {
        interrupt()
        say('SEARCH IS OFFLINE.')
      })
      .finally(() => setSearching(false))
  }

  function dropHit(hit, lane) {
    const footage = extrasRef.current.find((i) => i.clipId === hit.clipId || i.media?.clipId === hit.clipId)
    if (footage) {
      interrupt()
      addHazard(
        simRef.current,
        { ...footage, media: { ...footage.media, start: hit.start, end: hit.end } },
        laneCenter(lane),
        0,
      )
      encounter()
      return
    }
    if (hit.url) {
      interrupt()
      addHazard(
        simRef.current,
        {
          kind: 'footage',
          label: (hit.name || 'ARCHIVE').toUpperCase().slice(0, 14),
          media: {
            type: 'video',
            url: hit.url,
            name: hit.name,
            clipId: hit.clipId,
            start: hit.start,
            end: hit.end,
          },
        },
        laneCenter(lane),
        0,
      )
      encounter()
      return
    }
    interrupt()
    say('THAT CLIP IS NOT IN THE BAG. UPLOAD IT AGAIN.')
  }

  async function runCommand(event) {
    event.preventDefault()
    const text = String(new FormData(event.currentTarget).get('command') || command).trim()
    if (!text) return
    setCommand('')
    const sim = simRef.current
    interrupt()
    let result
    try {
      result = await runAgent(text, snapshot(sim))
    } catch {
      const local = parseCommand(text, sim)
      result = { ...local, action: local.type }
    }
    const action = result.action || result.type
    if (action === 'search') {
      findMoments(result.query || text)
      return
    }
    if (action === 'ask') {
      const footage = extrasRef.current.filter((i) => i.kind === 'footage').at(-1)
      try {
        const data = await askClip(result.question || text, result.clipId || footage?.clipId)
        say(String(data.answer || 'NO ANSWER').toUpperCase().slice(0, 180))
      } catch {
        say('ASK FAILED. TRY SEARCHING FIRST.')
      }
      return
    }
    if (action === 'error') {
      blip(220, 0.08)
      say(result.text || "I DIDN'T CATCH THAT.")
      return
    }
    blip(880, 0.05)
    if (action === 'lane') {
      commandLane(sim, result.car, result.lane)
      return
    }
    if (action === 'footage') {
      const footage = extrasRef.current.filter((i) => i.kind === 'footage').at(-1)
      if (!footage) {
        say('UPLOAD SOME FOOTAGE FIRST. TAP UPLOAD IN THE BAG.')
        return
      }
      addHazard(sim, footage, laneCenter(result.lane ?? 1), 0)
      encounter()
      return
    }
    if (action === 'hazard' && result.item) {
      addHazard(sim, result.item, laneCenter(result.lane ?? 1), 0)
      encounter()
      return
    }
    if (action === 'say') {
      say(result.text || 'OK.')
      return
    }
    const local = parseCommand(text, sim)
    if (local.type === 'error') {
      blip(220, 0.08)
      say(local.text)
      return
    }
    if (local.type === 'lane') commandLane(sim, local.car, local.lane)
    else if (local.type === 'footage') {
      const footage = extrasRef.current.filter((i) => i.kind === 'footage').at(-1)
      if (!footage) {
        say('UPLOAD SOME FOOTAGE FIRST. TAP UPLOAD IN THE BAG.')
        return
      }
      addHazard(sim, footage, laneCenter(local.lane), 0)
      encounter()
    } else {
      addHazard(sim, local.item, laneCenter(local.lane), 0)
      encounter()
    }
  }

  function restart(link) {
    interrupt()
    simRef.current = createSim(link)
    queueRef.current = [
      {
        speaker: null,
        text: link ? 'LINK ON. CARS SHARE WHAT THEY SEE NEARBY.' : 'LINK OFF. EVERY CAR IS ON ITS OWN SENSORS.',
      },
    ]
    doneAtRef.current = null
    setCurrent(null)
    setReport(null)
    alertedRef.current.clear()
    setView(snapshot(simRef.current))
    blip(link ? 880 : 260, 0.08)
  }

  function advance() {
    if (!done) {
      setTyped(shown)
      return
    }
    if (!queueRef.current.length) return
    doneAtRef.current = null
    setCurrent(queueRef.current.shift())
  }

  function toggleVoice() {
    if (voiceOn) stopSpeaking()
    setVoiceOn(!voiceOn)
    blip(voiceOn ? 260 : 880, 0.06)
  }

  function saveCustom(scope) {
    const label = draft.trim().slice(0, 10).toUpperCase()
    if (!label) return
    setExtras((list) => [
      ...list.filter((item) => item.label !== label),
      { id: `custom-${label}`, kind: `custom-${scope}`, label, scope },
    ])
    setDraft('')
    setNaming(false)
    say(`${label} IS IN THE BAG. DRAG IT ONTO THE ROAD.`)
    blip(880, 0.06)
  }

  const bag = [...ITEMS, ...extras]

  return (
    <div className="game">
      <header className="topbar">
        <div className="logo">
          LINK<span>ROAD</span>
        </div>
        <StackHud health={health} />
        <div className="stats">
          <span>
            MSGS <b>{view.stats.messages}</b>
          </span>
          <span className={view.stats.hardBrakes ? 'bad' : ''}>
            HARD BRAKES <b>{view.stats.hardBrakes}</b>
          </span>
        </div>
        <div className="controls">
          {voiceSupported && (
            <button type="button" className={`toggle ${voiceOn ? 'on' : 'off'}`} onClick={toggleVoice}>
              VOICE <b>{voiceOn ? 'ON' : 'OFF'}</b>
            </button>
          )}
          <button type="button" className={`toggle ${view.link ? 'on' : 'off'}`} onClick={() => restart(!view.link)}>
            V2V LINK <b>{view.link ? 'ON' : 'OFF'}</b>
          </button>
          <button type="button" className="toggle" onClick={() => restart(view.link)}>
            RESET
          </button>
        </div>
      </header>

      <section className="party">
        {view.cars.map((c) => (
          <div key={c.id} className={`member ${c.status}`}>
            <i className="swatch" style={{ background: c.color }} />
            <div className="member-body">
              <div className="member-top">
                <strong>{c.name}</strong>
                <em>L{c.lane + 1}</em>
              </div>
              <div className="hp">
                <span>HP</span>
                <div className="bar">
                  <div
                    className={c.comfort > 60 ? 'good' : c.comfort > 30 ? 'warn' : 'low'}
                    style={{ width: `${c.comfort}%` }}
                  />
                </div>
              </div>
              <div className="member-foot">
                <span className="state">{c.note || STATUS[c.status]}</span>
                <span>{c.mph} MPH</span>
              </div>
            </div>
          </div>
        ))}
      </section>

      <main className="stage">
        <Scene ref={sceneRef} simRef={simRef} hoverRef={hoverRef} />
        <SearchPanel
          query={searchQuery}
          onQuery={setSearchQuery}
          hits={hits}
          loading={searching}
          onSearch={findMoments}
          onDrop={dropHit}
          traces={traces}
        />
        <div className="legend">
          <span><i className="dot linked" /> LINKED</span>
          <span><i className="dot idle" /> READY</span>
          <span><i className="dot quiet" /> QUIET</span>
          <span className="sep">ROAD NEWS → ALL CARS COMING</span>
          <span className="sep">LANE NEWS → NEARBY ONLY</span>
        </div>
        {report && (
          <IncidentCard
            report={report}
            linked={[...(alertedRef.current.get(report.id) ?? [])]}
            onClose={() => setReport(null)}
          />
        )}
      </main>

      <footer className="bottom">
        <div className="talk">
          <div
            className="dialogue"
            role="button"
            tabIndex={0}
            onClick={advance}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') advance()
            }}
          >
            {naming ? (
              <form
                className="namer"
                onSubmit={(event) => {
                  event.preventDefault()
                  saveCustom('road')
                }}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <p>NAME THE OBJECT. DOES IT AFFECT THE WHOLE ROAD OR ONE LANE?</p>
                <div className="namer-row">
                  <input
                    value={draft}
                    maxLength={10}
                    autoFocus
                    placeholder="DEER"
                    onChange={(event) => setDraft(event.target.value.toUpperCase())}
                  />
                  <button type="button" onClick={() => saveCustom('road')}>ROAD</button>
                  <button type="button" onClick={() => saveCustom('lane')}>LANE</button>
                  <button type="button" className="ghost-btn" onClick={() => setNaming(false)}>X</button>
                </div>
              </form>
            ) : (
              <p>
                {typed}
                {done && queueRef.current.length > 0 && <i className="cursor">▼</i>}
              </p>
            )}
          </div>

          <form className="command" onSubmit={runCommand}>
            <span className="prompt">▶</span>
            <input
              name="command"
              value={command}
              maxLength={80}
              spellCheck={false}
              placeholder="FIND A PEDESTRIAN · RED TRUCK TO LANE 1"
              aria-label="Command"
              onChange={(event) => setCommand(event.target.value)}
            />
            <button type="submit">SEND</button>
          </form>
        </div>

        <div className="bag">
          <div className="bag-title">BAG · DRAG ONTO THE ROAD</div>
          <div className="bag-grid">
            {bag.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`cmd scope-${item.scope}`}
                onPointerDown={(event) => arm(item, event)}
              >
                <ItemSprite id={spriteFor(item)} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.scope.toUpperCase()}</small>
                </span>
              </button>
            ))}
            <button
              type="button"
              className="cmd cmd-upload"
              onClick={() => {
                fileRef.current?.click()
                blip(600, 0.04)
              }}
            >
              <ItemSprite id="upload" />
              <span>
                <strong>UPLOAD</strong>
                <small>VIDEO / PHOTO</small>
              </span>
            </button>
            <input ref={fileRef} type="file" accept="video/*,image/*" hidden onChange={upload} />
            <button
              type="button"
              className="cmd cmd-custom"
              onClick={() => {
                setNaming(true)
                blip(600, 0.04)
              }}
            >
              <ItemSprite id="custom" />
              <span>
                <strong>CUSTOM</strong>
                <small>NAME IT</small>
              </span>
            </button>
          </div>
        </div>
      </footer>

      {ghost && (
        <div className={`ghost scope-${ghost.scope}`} style={{ left: ghost.x, top: ghost.y }}>
          <ItemSprite id={spriteFor(ghost)} />
          <span>
            <strong>{ghost.label}</strong>
            <small>{ghost.hint}</small>
          </span>
        </div>
      )}
      {flash && <div className="flash" />}
    </div>
  )
}
