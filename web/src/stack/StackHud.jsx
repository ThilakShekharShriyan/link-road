const LABELS = [
  ['yolo', 'YOLO'],
  ['cosmos', 'COSMOS'],
  ['search', 'SEARCH'],
  ['llm', 'LLM'],
]

function chipText(mode) {
  if (mode === 'live') return 'LIVE'
  if (mode === 'auth') return 'AUTH'
  if (mode === 'off') return 'OFF'
  return 'MOCK'
}

export default function StackHud({ health }) {
  const modes = health?.modes || { yolo: 'live', cosmos: 'mock', search: 'mock', llm: 'mock' }
  return (
    <div className="stack-hud" title="Partner stack: live when keys are set, mock otherwise">
      {LABELS.map(([key, label]) => {
        const mode = modes[key] || 'mock'
        return (
          <span key={key} className={`stack-chip ${mode}`}>
            {label} <b>{chipText(mode)}</b>
          </span>
        )
      })}
    </div>
  )
}
