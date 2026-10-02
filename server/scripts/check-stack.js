// Health + smoke checks for the Builders Challenge stack, following ARCHITECTURE_REFERENCE.md
// and the challenge repo's gpu/ and retrieval/ skills. Never prints credentials.
import {
  CANARY_1B_URL,
  COSMOS3_REASON_URL,
  COSMOS_EMBED1_URL,
  GPU_BEARER_TOKEN,
  INGRESS_URL,
  TEAM_CONFIG,
  WANDB_API_KEY,
  WANDB_MODEL,
  YOLO_URL,
  gpuHeaders,
  modes,
} from '../src/config.js'
import { complete } from '../src/providers/llm.js'
import { vssConfigured, vssToken } from '../src/providers/vss.js'

const ROAD_QUERIES = [
  ['truck changing lanes on the highway', 'i24_cam-1'],
  ['vehicle braking hard', 'i24_cam-1'],
  ['pedestrian near the road while driving', 'pie_cam-3'],
  ['person close to a moving vehicle', 'cross-pack'],
]

const rows = []
const report = (area, check, ok, detail = '') => {
  rows.push({ area, check, ok })
  const mark = ok === null ? 'SKIP' : ok ? 'PASS' : 'FAIL'
  console.log(`${mark.padEnd(4)}  ${area.padEnd(6)} ${check.padEnd(42)} ${detail}`)
}

async function status(url, headers = {}) {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(6000) })
    return response.status
  } catch {
    return 0
  }
}

async function checkGpu() {
  const headers = gpuHeaders()
  const matrix = [
    ['cosmos3-reason', COSMOS3_REASON_URL, ['/v1/models', '/v1/health/ready', '/v1/health/live']],
    ['cosmos-embed1', COSMOS_EMBED1_URL, ['/v1/models', '/v1/health/ready', '/v1/health/live']],
    ['yolo11', YOLO_URL, ['/healthz']],
    ['canary-1b', CANARY_1B_URL, ['/v1/health/ready', '/v1/health/live']],
  ]
  for (const [name, base, paths] of matrix) {
    const codes = await Promise.all(paths.map((p) => status(`${base}${p}`, headers)))
    const detail = paths.map((p, i) => `${p}:${codes[i] || 'conn-err'}`).join(' ')
    const hint = codes.some((c) => c === 401 || c === 403) ? ' (needs GPU_BEARER_TOKEN)' : ''
    report('gpu', `${name} health`, codes.every((c) => c === 200), detail + hint)
  }
}

async function vss(path, token, init = {}) {
  const response = await fetch(`${INGRESS_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(init.timeout || 30000),
  })
  const data = await response.json().catch(() => ({}))
  return { status: response.status, data }
}

async function checkVss() {
  if (!vssConfigured()) {
    report('vss', 'login', null, 'INGRESS_URL / USERNAME / PASSWORD not set')
    return
  }
  let token
  try {
    token = await vssToken(true)
    report('vss', 'POST /auth/login', true)
  } catch (error) {
    report('vss', 'POST /auth/login', false, error.message)
    return
  }
  const me = await vss('/api/v1/auth/me', token)
  report('vss', 'GET /auth/me', me.status === 200, me.data.username || `status ${me.status}`)

  const schema = await vss('/api/v1/metadata/schema', token)
  const cameras = schema.data.schema?.find((f) => f.name === 'camera_id')?.options || []
  report('vss', 'GET /metadata/schema', schema.status === 200, cameras.length ? `cameras: ${cameras.join(', ')}` : `status ${schema.status}`)

  const explore = await vss('/api/v1/videos/explore?scope=all&limit=5&offset=0', token)
  const listed = explore.data.videos || explore.data.items || explore.data.results || []
  report('vss', 'GET /videos/explore', explore.status === 200, `${listed.length} videos in first page`)

  for (const [query, expected] of ROAD_QUERIES) {
    const result = await vss('/api/v1/search', token, {
      method: 'POST',
      body: JSON.stringify({ query, top_k: 10, llm_top_n: 3, min_similarity: 0.3, include_public: true }),
      timeout: 40000,
    })
    const hits = result.data.chunk_results?.length ? result.data.chunk_results : result.data.results || []
    const found = [...new Set(hits.map((h) => h.camera_id).filter(Boolean))]
    const detail = `${hits.length} hits, expect ${expected}${found.length ? `, got ${found.join('/')}` : ''}`
    report('vss', `search "${query}"`, result.status === 200 && hits.length > 0, detail)
  }

  const ask = await vss('/api/v1/agent/ask', token, {
    method: 'POST',
    body: JSON.stringify({ question: 'Is any vehicle braking hard or changing lanes on the highway?', top_k: 10 }),
    timeout: 60000,
  })
  report('vss', 'POST /agent/ask', ask.status === 200 && Boolean(ask.data.answer), String(ask.data.answer || `status ${ask.status}`).slice(0, 80))
}

async function checkLlm() {
  if (!WANDB_API_KEY) {
    report('wandb', 'chat completion', null, 'WANDB_API_KEY not set')
    return
  }
  try {
    const result = await complete({ system: 'Reply with the single word OK.', user: 'ping' })
    report('wandb', `chat completion (${WANDB_MODEL})`, Boolean(result.text), result.text.slice(0, 40))
  } catch (error) {
    report('wandb', `chat completion (${WANDB_MODEL})`, false, error.message)
  }
}

console.log(`config: ${TEAM_CONFIG || 'no /config/*.config (using .env)'}  gpu token: ${GPU_BEARER_TOKEN ? 'set' : 'missing'}`)
console.log(`modes: ${JSON.stringify(modes())}\n`)
await checkGpu()
await checkVss()
await checkLlm()
const failed = rows.filter((r) => r.ok === false).length
const skipped = rows.filter((r) => r.ok === null).length
console.log(`\n${rows.length - failed - skipped} passed, ${failed} failed, ${skipped} skipped`)
process.exit(failed ? 1 : 0)
