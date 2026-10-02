export function ItemSprite({ id }) {
  if (id === 'pothole') {
    return (
      <svg viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
        <rect x="3" y="6" width="10" height="6" fill="#1a1c22" />
        <rect x="5" y="5" width="6" height="2" fill="#2a2e38" />
        <rect x="4" y="8" width="3" height="1" fill="#8a909c" />
        <rect x="9" y="9" width="3" height="1" fill="#8a909c" />
      </svg>
    )
  }
  if (id === 'debris') {
    return (
      <svg viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
        <rect x="3" y="5" width="10" height="8" fill="#a56a32" />
        <rect x="3" y="5" width="10" height="2" fill="#d08948" />
        <rect x="7" y="7" width="2" height="6" fill="#6b4120" />
        <rect x="3" y="9" width="10" height="1" fill="#6b4120" />
      </svg>
    )
  }
  if (id === 'speed') {
    return (
      <svg viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
        <rect x="7" y="8" width="2" height="6" fill="#6a5430" />
        <rect x="3" y="2" width="10" height="8" fill="#f0d040" />
        <rect x="4" y="3" width="8" height="6" fill="#fff6c8" />
        <rect x="6" y="6" width="4" height="1" fill="#1a1c2c" />
        <rect x="8" y="4" width="1" height="3" fill="#e04040" />
      </svg>
    )
  }
  if (id === 'police') {
    return (
      <svg viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
        <rect x="3" y="4" width="10" height="9" fill="#f4f4f4" />
        <rect x="3" y="4" width="5" height="9" fill="#1c2430" />
        <rect x="4" y="2" width="3" height="2" fill="#e04040" />
        <rect x="9" y="2" width="3" height="2" fill="#3a6dff" />
        <rect x="6" y="7" width="4" height="3" fill="#9fd0ff" />
      </svg>
    )
  }
  if (id === 'slow') {
    return (
      <svg viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
        <rect x="3" y="6" width="10" height="7" fill="#f07820" />
        <rect x="5" y="4" width="6" height="3" fill="#ffd080" />
        <rect x="6" y="8" width="4" height="2" fill="#fff" />
      </svg>
    )
  }
  if (id === 'footage' || id === 'upload') {
    return (
      <svg viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
        <rect x="2" y="5" width="9" height="7" fill="#2b3350" />
        <rect x="3" y="6" width="7" height="5" fill="#6fb3e8" />
        <rect x="4" y="9" width="5" height="2" fill="#6aa84f" />
        <rect x="11" y="6" width="3" height="5" fill="#2b3350" />
        <rect x="4" y="3" width="2" height="2" fill="#e8353b" />
        {id === 'upload' && <rect x="6" y="7" width="1" height="3" fill="#fbf8ec" />}
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="3" y="3" width="10" height="10" fill="#f8d848" />
      <rect x="7" y="5" width="2" height="4" fill="#1a1c2c" />
      <rect x="7" y="10" width="2" height="2" fill="#1a1c2c" />
    </svg>
  )
}
