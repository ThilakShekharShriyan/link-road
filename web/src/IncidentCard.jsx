import { useEffect, useRef } from 'react'

const GROUP_COLOR = {
  person: '#ff5a5a',
  bicycle: '#ff9a3c',
  car: '#ffd34d',
  truck: '#ffd34d',
  bus: '#ffd34d',
  motorcycle: '#ff9a3c',
  pothole: '#e08a2c',
}

const boxColor = (label) => GROUP_COLOR[label] || '#3ff2ff'

function Frame({ result }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !result) return undefined
    let live = true
    const img = new Image()
    img.onload = () => {
      if (!live) return
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const k = img.width / result.w
      ctx.font = '11px "Press Start 2P", monospace'
      ctx.textBaseline = 'top'
      ctx.lineWidth = 3
      for (const d of result.detections) {
        const color = boxColor(d.label)
        const x = d.x * k
        const y = d.y * k
        ctx.strokeStyle = color
        ctx.strokeRect(x, y, d.w * k, d.h * k)
        const text = `${d.label.toUpperCase()} ${Math.round(d.score * 100)}`
        const w = ctx.measureText(text).width + 8
        const ty = Math.max(0, y - 16)
        ctx.fillStyle = color
        ctx.fillRect(x - 1.5, ty, w, 16)
        ctx.fillStyle = '#1c1c24'
        ctx.fillText(text, x + 3, ty + 3)
      }
    }
    img.src = result.frame
    return () => {
      live = false
    }
  }, [result])

  return <canvas ref={ref} className="report-frame" />
}

export default function IncidentCard({ report, linked, onClose }) {
  const { status, car, color, lane, media, result, incident, error, cosmos, provider, progress } = report
  const scanning = status === 'scanning'
  const clear = incident?.type === 'clear'
  const pct = incident ? Math.round(incident.confidence * 100) : 0
  const caption = cosmos?.summary || cosmos?.caption || incident?.summary
  const scanText =
    progress?.total > 0
      ? `SCANNING FRAME ${progress.frames}/${progress.total} · ${progress.time.toFixed(1)}s`
      : 'RUNNING YOLO ON THE FULL CLIP...'

  return (
    <aside className={`report ${scanning ? 'is-scanning' : ''}`}>
      <header>
        <i className="swatch" style={{ background: color }} />
        <strong>{scanning ? `${car} USED SCAN!` : 'INCIDENT REPORT'}</strong>
        <button type="button" onClick={onClose} aria-label="Close report">
          X
        </button>
      </header>

      <div className="report-main">
        <div className="report-view">
          {scanning || !result ? (
            media.type === 'video' ? (
              <video
                src={media.url}
                autoPlay
                muted
                loop
                playsInline
                onLoadedMetadata={(event) => {
                  if (media.start) event.currentTarget.currentTime = media.start
                }}
              />
            ) : (
              <img src={media.url} alt="" />
            )
          ) : (
            <Frame result={result} />
          )}
          {scanning && <div className="scanline" />}
        </div>

        {scanning ? (
          <div className="report-body">
            <p className="verdict">{scanText}</p>
            <p className="meta">LANE {lane + 1} · {car}&apos;S FRONT CAMERA · WHOLE VIDEO</p>
          </div>
        ) : (
          <div className="report-body">
            <p className={`verdict ${clear ? 'ok' : incident.scope}`}>
              {clear ? 'ALL CLEAR' : incident.label}
              {!clear && pct > 0 && <span className="pct">{pct}%</span>}
            </p>
            {!clear && <span className="chip">{incident.scope === 'road' ? 'ROAD NEWS · ALL CARS' : `LANE ${lane + 1} · NEARBY`}</span>}
            <p>SEEN: {incident.seen}</p>
            {result?.catalog && <p>CLIP: {result.catalog}</p>}
            {caption && <p className="cosmos">COSMOS: {caption}</p>}
            {incident?.summary && incident.summary !== caption && <p className="agent">AGENT: {incident.summary}</p>}
            <p>
              {clear
                ? 'FALSE ALARM. NOBODY CHANGES LANES.'
                : linked.length
                  ? `ALERTED: ${car}, ${linked.join(', ')}`
                  : `ALERTED: ${car}. OTHERS JOIN WHEN CLOSE.`}
            </p>
            <p className="meta">
              {error ||
                [
                  result
                    ? `YOLOV8N · ${result.frames} FRAME${result.frames > 1 ? 'S' : ''} · ${Math.round(result.span || 0)}s · ${result.ms} MS`
                    : '',
                  provider ? `FUSE ${String(provider).toUpperCase()}` : '',
                  cosmos?.provider ? `CAP ${String(cosmos.provider).toUpperCase()}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}
