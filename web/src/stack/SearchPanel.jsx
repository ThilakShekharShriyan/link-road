import { useState } from 'react'

function stamp(seconds) {
  const t = Math.max(0, Number(seconds) || 0)
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function SearchPanel({ query, onQuery, hits, loading, onSearch, onDrop, traces }) {
  const [lane, setLane] = useState(1)
  const recent = (traces || []).slice(0, 4)

  return (
    <aside className="search-panel">
      <header>
        <strong>VIDEO SEARCH</strong>
        <span>{loading ? '…' : `${hits.length} HIT${hits.length === 1 ? '' : 'S'}`}</span>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const value = String(new FormData(event.currentTarget).get('q') || query).trim()
          onQuery(value)
          onSearch(value)
        }}
      >
        <input
          name="q"
          value={query}
          spellCheck={false}
          placeholder="PEDESTRIAN IN THE ROAD"
          aria-label="Search footage"
          onChange={(event) => onQuery(event.target.value)}
        />
        <button type="submit">FIND</button>
      </form>
      <div className="search-lane">
        <span>DROP LANE</span>
        {[0, 1, 2, 3].map((n) => (
          <button key={n} type="button" className={lane === n ? 'on' : ''} onClick={() => setLane(n)}>
            {n + 1}
          </button>
        ))}
      </div>
      <div className="search-hits">
        {hits.length === 0 && <p className="search-empty">SEARCH THE VAST ARCHIVE, OR UPLOAD A CLIP FIRST.</p>}
        {hits.map((hit) => (
          <article key={hit.id}>
            {hit.thumbnail ? <img src={hit.thumbnail} alt="" /> : <div className="search-ph" />}
            <div>
              <strong>
                {stamp(hit.start)} · {Math.round((hit.score || 0) * 100)}%
                {hit.provider === 'vast' ? ' · ARCHIVE' : ''}
              </strong>
              <p>{hit.caption || hit.name}</p>
              <button type="button" onClick={() => onDrop(hit, lane)}>
                DROP L{lane + 1}
              </button>
            </div>
          </article>
        ))}
      </div>
      {recent.length > 0 && (
        <ul className="search-trace">
          {recent.map((step) => (
            <li key={step.id} className={step.status || ''}>
              {step.name}
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
