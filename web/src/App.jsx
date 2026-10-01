import { useEffect, useRef, useState } from 'react'
import { INTRO, ITEMS } from './cast.js'
import Scene from './Scene.jsx'
import { ItemSprite } from './sprites.jsx'
import { ROAD_W, addHazard, createSim, dropZ, laneAt, leadZ } from './sim/world.js'

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

function snapshot(sim) {
  return {
    link: sim.link,
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

  const [view, setView] = useState(() => snapshot(simRef.current))
  const [current, setCurrent] = useState(null)
  const [typed, setTyped] = useState('')
  const [ghost, setGhost] = useState(null)
  const [flash, setFlash] = useState(false)
  const [naming, setNaming] = useState(false)
  const [draft, setDraft] = useState('')
  const [extras, setExtras] = useState([])

  const shown = current ? (current.speaker ? `${current.speaker}: ${current.text}` : current.text) : ''
  const done = shown.length > 0 && typed === shown

  useEffect(() => {
    const id = setInterval(() => {
      const sim = simRef.current
      if (sim.events.length) {
        queueRef.current.push(...sim.events.splice(0))
        if (queueRef.current.length > 5) queueRef.current = queueRef.current.slice(-5)
      }
      setView(snapshot(sim))
      const ready = doneAtRef.current != null && performance.now() - doneAtRef.current > 1300
      if (queueRef.current.length && (!currentRef.current || ready) && !namingRef.current) {
        doneAtRef.current = null
        setCurrent(queueRef.current.shift())
      }
    }, 200)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    currentRef.current = current
    namingRef.current = naming
  }, [current, naming])

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
      if (count % 3 === 1) blip(720, 0.018)
      if (count >= shown.length) clearInterval(id)
    }, 22)
    return () => clearInterval(id)
  }, [shown])

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
      hoverRef.current = point ? { x: point.x, z: dropZ(sim, point.z), scope: item.scope } : null
      let hint = 'DROP ON THE ROAD'
      if (point) {
        const where = item.scope === 'road' ? 'ALL LANES' : `LANE ${laneAt(point.x) + 1}`
        hint = `${where} · ${Math.round(dropZ(sim, point.z) - leadZ(sim))} M AHEAD`
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
      queueRef.current = []
      doneAtRef.current = 0
      addHazard(simRef.current, item, point.x, point.z)
      setFlash(true)
      encounterChime()
      setTimeout(() => setFlash(false), 450)
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

  function restart(link) {
    simRef.current = createSim(link)
    queueRef.current = [
      {
        speaker: null,
        text: link ? 'LINK ON. CARS SHARE WHAT THEY SEE NEARBY.' : 'LINK OFF. EVERY CAR IS ON ITS OWN SENSORS.',
      },
    ]
    doneAtRef.current = null
    setCurrent(null)
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

  function saveCustom(scope) {
    const label = draft.trim().slice(0, 10).toUpperCase()
    if (!label) return
    setExtras((list) => [
      ...list.filter((item) => item.label !== label),
      { id: `custom-${label}`, kind: `custom-${scope}`, label, scope },
    ])
    setDraft('')
    setNaming(false)
    doneAtRef.current = null
    setCurrent({ speaker: null, text: `${label} IS IN THE BAG. DRAG IT ONTO THE ROAD.` })
    blip(880, 0.06)
  }

  const bag = [...ITEMS, ...extras]

  return (
    <div className="game">
      <header className="topbar">
        <div className="logo">
          LINK<span>ROAD</span>
        </div>
        <div className="stats">
          <span>
            MSGS <b>{view.stats.messages}</b>
          </span>
          <span className={view.stats.hardBrakes ? 'bad' : ''}>
            HARD BRAKES <b>{view.stats.hardBrakes}</b>
          </span>
        </div>
        <div className="controls">
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
        <div className="legend">
          <span><i className="dot linked" /> LINKED</span>
          <span><i className="dot idle" /> READY</span>
          <span><i className="dot quiet" /> QUIET</span>
          <span className="sep">ROAD NEWS → ALL CARS COMING</span>
          <span className="sep">LANE NEWS → NEARBY ONLY</span>
        </div>
      </main>

      <footer className="bottom">
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
                <ItemSprite id={item.id} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.scope.toUpperCase()}</small>
                </span>
              </button>
            ))}
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
          <ItemSprite id={ghost.id} />
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
