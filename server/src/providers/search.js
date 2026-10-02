import { VAST_API_KEY, VAST_SEARCH_URL, VAST_UPLOAD, authHeaders } from '../config.js'
import { allSegments, getClip, publicClip } from '../store.js'
import { withTrace } from '../trace.js'
import { cosine, embed } from './embed.js'
import { vssConfigured, vssSearch, vssUpload } from './vss.js'

function hitFromSegment(segment, score, clip) {
  return {
    id: segment.id,
    clipId: segment.clipId,
    start: segment.start,
    end: segment.end,
    caption: segment.caption,
    score: Number(score.toFixed(3)),
    thumbnail: segment.thumbnail || null,
    name: clip?.name || segment.name || 'CLIP',
    url: clip ? publicClip(clip).url : null,
    provider: 'local',
  }
}

async function legacyVastQuery(text) {
  const response = await fetch(`${VAST_SEARCH_URL}/api/v1/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(VAST_API_KEY) },
    body: JSON.stringify({ query: text, top_k: 8 }),
  })
  if (!response.ok) throw new Error(`VAST search ${response.status}`)
  const data = await response.json()
  const rows = data.results || data.hits || data.data || []
  return rows.map((row, index) => ({
    id: row.id || `vast-${index}`,
    clipId: row.clipId || row.video_name || row.video_id || null,
    start: Number(row.start_time ?? row.start ?? 0),
    end: Number(row.end_time ?? row.end ?? 0),
    caption: row.description || row.caption || row.text || '',
    score: Number(row.similarity ?? row.score ?? 0),
    thumbnail: row.screenshot_url || row.thumbnail || null,
    name: row.video_name || row.name || 'VAST',
    url: row.url || null,
    provider: 'vast',
  }))
}

export async function ingest(clip, file) {
  return withTrace(
    'search.ingest',
    async () => {
      if (VAST_UPLOAD && vssConfigured() && file?.buffer) {
        try {
          const uploaded = await vssUpload(file, { tags: 'link-road', capture_type: 'traffic' })
          return { provider: 'vast', objectKey: uploaded.object_key || null }
        } catch {
          return { provider: 'local' }
        }
      }
      return { provider: 'local' }
    },
    { clipId: clip.id },
  )
}

export async function query(text, limit = 8) {
  return withTrace(
    'search.query',
    async () => {
      const remote = []
      let synthesis = ''
      if (vssConfigured()) {
        try {
          const archive = await vssSearch(text, limit)
          remote.push(...archive.hits)
          synthesis = archive.synthesis || ''
        } catch {
          /* local fallback */
        }
      } else if (VAST_SEARCH_URL && VAST_API_KEY) {
        try {
          remote.push(...(await legacyVastQuery(text)))
        } catch {
          /* local fallback */
        }
      }
      const vector = await embed(text)
      const segments = await allSegments()
      const local = []
      for (const segment of segments) {
        const score = cosine(vector, segment.vector || [])
        if (score < 0.05) continue
        const clip = await getClip(segment.clipId)
        local.push(hitFromSegment(segment, score, clip))
      }
      local.sort((a, b) => b.score - a.score)
      const seen = new Set()
      const merged = []
      for (const hit of [...remote, ...local]) {
        const key = `${hit.clipId || hit.id}:${hit.start}`
        if (seen.has(key)) continue
        seen.add(key)
        merged.push(hit)
        if (merged.length >= limit) break
      }
      return { hits: merged, synthesis }
    },
    { q: String(text || '').slice(0, 80) },
  )
}
