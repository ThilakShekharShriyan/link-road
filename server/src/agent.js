import { classify, normalizeIncident } from './incident.js'
import { AGENT_SYSTEM, FUSION_SYSTEM, ROAD_PROMPT } from './prompts.js'
import { askVideo, understand } from './providers/cosmos.js'
import { complete, llmMode } from './providers/llm.js'
import { vssAsk, vssConfigured } from './providers/vss.js'

const CARS = [
  { id: 'blue', words: ['blue', 'sedan'], short: 'BLUE' },
  { id: 'silver', words: ['silver', 'grey', 'gray', 'hatch', 'hatchback'], short: 'SILVER' },
  { id: 'truck', words: ['red', 'truck', 'lorry'], short: 'TRUCK' },
  { id: 'cab', words: ['yellow', 'cab', 'taxi'], short: 'CAB' },
  { id: 'van', words: ['green', 'van'], short: 'VAN' },
  { id: 'suv', words: ['black', 'suv'], short: 'SUV' },
]

const ITEMS = [
  { kind: 'pothole', re: /\bpot ?holes?\b/, label: 'POTHOLE', scope: 'road' },
  { kind: 'debris', re: /\b(debris|tires?|tyres?|junk|wreck(age)?)\b/, label: 'DEBRIS', scope: 'road' },
  { kind: 'speed', re: /\b(speed (limit|meter|sign|camera|trap)|radar)\b/, label: 'SPD METER', scope: 'road' },
  { kind: 'police', re: /\b(police|cops?|patrol)\b/, label: 'POLICE', scope: 'lane' },
  { kind: 'slow', re: /\bslow (car|vehicle|driver|truck)\b/, label: 'SLOW CAR', scope: 'lane' },
]

const NUMBERS = {
  1: 0, one: 0, first: 0, '1st': 0,
  2: 1, two: 1, second: 1, '2nd': 1,
  3: 2, three: 2, third: 2, '3rd': 2,
  4: 3, four: 3, fourth: 3, '4th': 3,
}

const LANES = 4
const has = (text, word) => new RegExp(`\\b${word}\\b`).test(text)

function laneIn(text) {
  const named = text.match(/\blane (\w+)\b/) || text.match(/\b(\w+) lane\b/)
  if (named && named[1] in NUMBERS) return NUMBERS[named[1]]
  if (/\b(leftmost|far left|fast lane)\b/.test(text)) return 0
  if (/\b(rightmost|far right|slow lane|last lane)\b/.test(text)) return LANES - 1
  return null
}

const normalize = (text) =>
  ` ${String(text || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()} `

function mockAgent(text) {
  const raw = normalize(text)
  const lane = laneIn(raw)

  if (/\b(find|search|show|where|locate|look for)\b/.test(raw)) {
    return { action: 'search', query: String(text || '').trim(), reason: 'keyword search' }
  }
  if (/\b(was|were|did|does|anyone|what happened|ask|crosswalk|before)\b/.test(raw) || raw.includes('?')) {
    return { action: 'ask', question: String(text || '').trim(), reason: 'keyword ask' }
  }

  const car = CARS.find((c) => c.words.some((w) => has(raw, w)))
  if (car) {
    if (lane == null) return { action: 'error', text: `WHICH LANE SHOULD ${car.short} TAKE?` }
    if (lane < 0 || lane >= LANES) return { action: 'error', text: `THERE ARE ONLY ${LANES} LANES.` }
    return { action: 'lane', car: car.id, lane, reason: 'regex lane' }
  }

  if (/\b(footage|video|clip|photo|image|upload)\b/.test(raw)) {
    return { action: 'footage', lane: lane ?? 1, reason: 'regex footage' }
  }

  const hazard = ITEMS.find((h) => h.re.test(raw))
  if (hazard) {
    return { action: 'hazard', item: { kind: hazard.kind, label: hazard.label, scope: hazard.scope }, lane: lane ?? 1, reason: 'regex hazard' }
  }

  const thing = raw.match(/^ (?:there s |there is |theres |a |an |the |some )*(.+?) (?:in|on) (?:the )?(?:lane \w+|\w+ lane)/)
  if (thing && lane != null) {
    const label = thing[1].toUpperCase().slice(0, 10).trim()
    return { action: 'hazard', item: { kind: 'custom-road', label, scope: 'road' }, lane, reason: 'regex custom' }
  }

  return { action: 'error', text: "I DIDN'T CATCH THAT. TRY 'RED TRUCK TO LANE 1' OR 'FIND A PEDESTRIAN'." }
}

export async function runAgent(text, snapshot = {}) {
  const fallback = mockAgent(text)
  if (llmMode() === 'mock') return { ...fallback, provider: 'mock' }
  try {
    const result = await complete({
      system: AGENT_SYSTEM,
      user: `Command: ${text}\nSnapshot: ${JSON.stringify(snapshot).slice(0, 2000)}`,
      json: true,
    })
    const parsed = result.json
    if (!parsed?.action || (parsed.action === 'error' && fallback.action !== 'error')) {
      return { ...fallback, provider: 'wandb-fallback' }
    }
    // The LLM often echoes the user's 1-based lane number despite the 0-based prompt.
    const lane = laneIn(normalize(text)) ?? parsed.lane
    return { ...fallback, ...parsed, lane, provider: result.provider }
  } catch {
    return { ...fallback, provider: 'mock' }
  }
}

export async function fuseIncident({ detections, caption, time, frames }) {
  const yolo = classify(detections || [])
  const cosmos = await understand({
    detections,
    time,
    prompt: ROAD_PROMPT,
    frames: frames || [],
  }).catch(() => ({ caption: caption || '', summary: caption || '', provider: 'mock' }))
  const summary = caption || cosmos.summary || cosmos.caption || ''
  const fallback = { ...yolo, summary, provider: cosmos.provider }
  if (llmMode() === 'mock') return { incident: fallback, cosmos, provider: 'mock' }
  try {
    const result = await complete({
      system: FUSION_SYSTEM,
      user: `YOLO detections: ${JSON.stringify((detections || []).map((d) => ({ label: d.label, score: d.score })))}\nCaption: ${summary}\nTime: ${time ?? 0}`,
      json: true,
    })
    const incident = normalizeIncident(result.json, fallback)
    incident.provider = result.provider
    incident.summary = incident.summary || summary
    return { incident, cosmos: { ...cosmos, summary }, provider: result.provider }
  } catch {
    return { incident: fallback, cosmos, provider: 'mock' }
  }
}

export async function answerQuestion({ clipId, question, captions, videoId }) {
  if (vssConfigured()) {
    try {
      const archive = await vssAsk(question, videoId || null)
      if (archive.answer) return archive
    } catch {
      /* local captions */
    }
  }
  if (llmMode() === 'live' && captions?.length) {
    try {
      const result = await complete({
        system: 'Answer from clip captions only. Short uppercase dispatch style.',
        user: `Captions:\n${captions.join('\n')}\n\nQuestion: ${question}`,
        json: false,
      })
      if (result.text) return { answer: result.text, provider: result.provider }
    } catch {
      /* cosmos fallback */
    }
  }
  return askVideo({ videoId, question, captions })
}
