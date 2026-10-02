async function read(res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `API ${res.status}`)
  return data
}

export function getHealth() {
  return fetch('/api/health').then(read)
}

export function getTraces() {
  return fetch('/api/traces').then(read)
}

export function listClips() {
  return fetch('/api/clips').then(read)
}

export async function ingestClip(file, extras = {}) {
  const body = new FormData()
  body.set('file', file)
  if (extras.duration) body.set('duration', String(extras.duration))
  return read(await fetch('/api/ingest', { method: 'POST', body }))
}

export function scanClip(payload) {
  return fetch('/api/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(read)
}

export function searchClips(query) {
  return fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  }).then(read)
}

export function askClip(question, clipId) {
  return fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, clipId }),
  }).then(read)
}

export function runAgent(text, snapshot) {
  return fetch('/api/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, snapshot }),
  }).then(read)
}
