import {
  COSMOS3_REASON_URL,
  COSMOS3_REASON_URL_SET,
  GPU_BEARER_TOKEN,
  NVIDIA_API_KEY,
  NVIDIA_COSMOS_MODEL,
  NVIDIA_NIM_MODEL,
  NVIDIA_NIM_URL,
  NVIDIA_VSS_URL,
  VIDEO_DATA_LIMIT,
  authHeaders,
  gpuHeaders,
} from '../config.js'
import { classify, tally } from '../incident.js'
import { CAPTION_SUMMARY_PROMPT, ROAD_PROMPT, SUMMARY_AGGREGATION_PROMPT } from '../prompts.js'
import { withTrace } from '../trace.js'
import { cosmosModel } from './nim.js'

function mockCaption({ detections, time, start, end, name }) {
  const t = Number.isFinite(time) ? time : start || 0
  const window = Number.isFinite(end) ? ` ${start ?? 0}–${end}s` : ` ${t.toFixed(1)}s`
  if (!detections?.length) {
    return `${window.trim()}: ${name || 'road footage'}. No objects of interest yet.`
  }
  const seen = tally(detections)
  const incident = classify(detections)
  const where = incident.scope === 'road' ? 'Affects the whole roadway.' : 'One lane affected.'
  const hint =
    incident.type === 'clear' ? 'Road looks clear.' : `Possible ${incident.label}. ${where}`
  return `${window.trim()}: ${seen}. ${hint}`
}

function asDataUrl(buffer, mime) {
  return `data:${mime || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`
}

function httpUrl(value) {
  return /^https?:\/\//i.test(String(value || ''))
}

function visionContent(input, prompt) {
  const content = [{ type: 'text', text: prompt || ROAD_PROMPT }]
  if (httpUrl(input.videoUrl)) {
    content.push({ type: 'video_url', video_url: { url: input.videoUrl } })
    return content
  }
  const file = input.file
  if (file?.buffer && file.buffer.length <= VIDEO_DATA_LIMIT) {
    const mime = file.type || (file.name?.match(/\.(png|jpe?g|webp)$/i) ? 'image/jpeg' : 'video/mp4')
    if (mime.startsWith('image')) {
      content.push({ type: 'image_url', image_url: { url: asDataUrl(file.buffer, mime) } })
    } else {
      content.push({ type: 'video_url', video_url: { url: asDataUrl(file.buffer, mime) } })
    }
    return content
  }
  for (const frame of (input.frames || []).slice(0, 4)) {
    if (!frame) continue
    content.push({ type: 'image_url', image_url: { url: frame } })
  }
  return content
}

async function vssUnderstand({ file, prompt }) {
  const body = new FormData()
  body.set('purpose', 'vision')
  body.set('media_type', file.type?.startsWith('image') ? 'image' : 'video')
  body.set('file', new Blob([file.buffer], { type: file.type || 'application/octet-stream' }), file.name || 'clip.mp4')
  const uploaded = await fetch(`${NVIDIA_VSS_URL}/files`, {
    method: 'POST',
    headers: authHeaders(NVIDIA_API_KEY),
    body,
  })
  if (!uploaded.ok) throw new Error(`VSS files ${uploaded.status}`)
  const meta = await uploaded.json()
  const videoId = meta.id
  const summarized = await fetch(`${NVIDIA_VSS_URL}/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(NVIDIA_API_KEY) },
    body: JSON.stringify({
      id: videoId,
      prompt: prompt || ROAD_PROMPT,
      caption_summarization_prompt: CAPTION_SUMMARY_PROMPT,
      summary_aggregation_prompt: SUMMARY_AGGREGATION_PROMPT,
      model: NVIDIA_COSMOS_MODEL,
      max_tokens: 1024,
      temperature: 0.3,
      top_p: 0.3,
      chunk_duration: 20,
    }),
  })
  if (!summarized.ok) throw new Error(`VSS summarize ${summarized.status}`)
  const data = await summarized.json()
  const summary = data.choices?.[0]?.message?.content || data.summary || ''
  return { caption: summary, summary, videoId, provider: 'vss' }
}

async function openaiChat(base, model, input, prompt, headers, provider) {
  const root = String(base || '').replace(/\/$/, '')
  const path = root.endsWith('/v1') ? '/chat/completions' : '/v1/chat/completions'
  const content = visionContent(input, prompt)
  const response = await fetch(`${root}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      max_tokens: 512,
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(90000),
  })
  if (!response.ok) {
    await response.text().catch(() => '')
    throw new Error(`cosmos chat ${response.status}`)
  }
  const data = await response.json()
  const summary = data.choices?.[0]?.message?.content || ''
  if (!summary) throw new Error('empty cosmos caption')
  return { caption: summary, summary, videoId: null, provider }
}

export function cosmosMode() {
  if (NVIDIA_VSS_URL) return 'vss'
  if (GPU_BEARER_TOKEN) return 'nim'
  if (NVIDIA_API_KEY) return 'cloud'
  return 'mock'
}

export async function understand(input = {}) {
  const prompt = input.prompt || ROAD_PROMPT
  return withTrace(
    'cosmos.understand',
    async () => {
      if (NVIDIA_VSS_URL && input.file?.buffer) {
        try {
          return await vssUnderstand({ file: input.file, prompt })
        } catch (error) {
          if (!GPU_BEARER_TOKEN && !NVIDIA_API_KEY) throw error
        }
      }
      if (GPU_BEARER_TOKEN || COSMOS3_REASON_URL_SET) {
        try {
          const model = await cosmosModel()
          return await openaiChat(COSMOS3_REASON_URL, model, input, prompt, gpuHeaders(true), 'nim')
        } catch {
          /* cloud / mock */
        }
      }
      if (NVIDIA_API_KEY && (input.frames?.length || input.file?.buffer)) {
        try {
          return await openaiChat(
            NVIDIA_NIM_URL,
            NVIDIA_NIM_MODEL,
            input,
            prompt,
            authHeaders(NVIDIA_API_KEY),
            'cloud',
          )
        } catch {
          /* mock */
        }
      }
      const caption = mockCaption(input)
      return { caption, summary: caption, videoId: null, provider: 'mock' }
    },
    { mode: cosmosMode() },
  )
}

export async function askVideo({ videoId, question, captions }) {
  return withTrace(
    'cosmos.ask',
    async () => {
      if (NVIDIA_VSS_URL && videoId) {
        const response = await fetch(`${NVIDIA_VSS_URL}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(NVIDIA_API_KEY) },
          body: JSON.stringify({
            id: videoId,
            messages: [{ role: 'user', content: question }],
            model: NVIDIA_COSMOS_MODEL,
          }),
        })
        if (!response.ok) throw new Error(`VSS chat ${response.status}`)
        const data = await response.json()
        return { answer: data.choices?.[0]?.message?.content || '', provider: 'vss' }
      }
      const context = (captions || []).join('\n')
      if ((GPU_BEARER_TOKEN || COSMOS3_REASON_URL_SET || NVIDIA_API_KEY) && (context || question)) {
        try {
          const liveNim = Boolean(GPU_BEARER_TOKEN || COSMOS3_REASON_URL_SET)
          const base = liveNim ? COSMOS3_REASON_URL : NVIDIA_NIM_URL
          const model = liveNim ? await cosmosModel() : NVIDIA_NIM_MODEL
          const headers = liveNim ? gpuHeaders(true) : authHeaders(NVIDIA_API_KEY)
          const root = String(base || '').replace(/\/$/, '')
          const path = root.endsWith('/v1') ? '/chat/completions' : '/v1/chat/completions'
          const response = await fetch(`${root}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: 'Answer from the clip captions only. Be brief.' },
                { role: 'user', content: `Captions:\n${context}\n\nQuestion: ${question}` },
              ],
              max_tokens: 256,
            }),
            signal: AbortSignal.timeout(30000),
          })
          if (response.ok) {
            const data = await response.json()
            const answer = data.choices?.[0]?.message?.content || ''
            if (answer) return { answer, provider: liveNim ? 'nim' : 'cloud' }
          }
        } catch {
          /* mock */
        }
      }
      const hay = context.toLowerCase()
      const q = (question || '').toLowerCase()
      const yes = ['person', 'people', 'pedestrian', 'crash', 'car', 'bike', 'cyclist', 'animal', 'pothole'].filter(
        (word) => q.includes(word) && hay.includes(word),
      )
      const answer = context
        ? yes.length
          ? `YES. CAPTIONS MENTION ${yes.join(', ').toUpperCase()}. ${captions[0]}`
          : `FROM THE CLIP: ${captions[0]}`
        : 'NO CAPTIONS YET. UPLOAD AND SCAN FOOTAGE FIRST.'
      return { answer, provider: 'mock' }
    },
    { videoId: videoId || null },
  )
}
