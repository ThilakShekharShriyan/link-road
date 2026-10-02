import { CARS, ITEMS } from './cast.js'
import { LANES } from './sim/world.js'

const HELP = "TRY 'RED TRUCK TO LANE 1' OR 'POTHOLE IN LANE 3'."

const NUMBERS = {
  1: 0, one: 0, first: 0, '1st': 0,
  2: 1, two: 1, second: 1, '2nd': 1,
  3: 2, three: 2, third: 2, '3rd': 2,
  4: 3, four: 3, fourth: 3, '4th': 3,
  5: 4, five: 4, fifth: 4, '5th': 4,
}

const HAZARD_WORDS = [
  { kind: 'pothole', re: /\bpot ?holes?\b/ },
  { kind: 'debris', re: /\b(debris|tires?|tyres?|junk|wreck(age)?)\b/ },
  { kind: 'speed', re: /\b(speed (limit|meter|sign|camera|trap)|radar)\b/ },
  { kind: 'police', re: /\b(police|cops?|patrol)\b/ },
  { kind: 'slow', re: /\bslow (car|vehicle|driver|truck)\b/ },
]

const has = (text, word) => new RegExp(`\\b${word}\\b`).test(text)

function laneIn(text) {
  const named = text.match(/\blane (\w+)\b/) || text.match(/\b(\w+) lane\b/)
  if (named && named[1] in NUMBERS) return { abs: NUMBERS[named[1]] }
  if (/\b(leftmost|far left|fast lane)\b/.test(text)) return { abs: 0 }
  if (/\b(rightmost|far right|slow lane|last lane)\b/.test(text)) return { abs: LANES - 1 }
  if (has(text, 'left')) return { rel: -1 }
  if (has(text, 'right')) return { rel: 1 }
  return null
}

function resolveLane(spec, from) {
  if (!spec) return null
  return spec.abs ?? from + spec.rel
}

export function parseCommand(input, sim) {
  const text = ` ${input.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()} `
  const lane = laneIn(text)

  if (/\b(find|search|show|where|locate|look for)\b/.test(text)) {
    return { type: 'search', query: input.trim() }
  }
  if (/\?/.test(input) || /\b(was|were|did|anyone|what happened|crosswalk)\b/.test(text)) {
    return { type: 'ask', question: input.trim() }
  }

  const car = CARS.find((c) => c.words.some((w) => has(text, w)))
  if (car) {
    const live = sim.cars.find((c) => c.id === car.id)
    const target = resolveLane(lane, live.target ?? live.lane)
    if (target == null) return { type: 'error', text: `WHICH LANE SHOULD ${car.short} TAKE? ${HELP}` }
    if (target < 0 || target >= LANES) return { type: 'error', text: `THERE ARE ONLY ${LANES} LANES.` }
    return { type: 'lane', car: car.id, lane: target }
  }

  const hazard = HAZARD_WORDS.find((h) => h.re.test(text))
  const at = lane?.abs ?? null
  if (at != null && at >= LANES) return { type: 'error', text: `THERE ARE ONLY ${LANES} LANES.` }
  if (/\b(footage|video|clip|photo|image|upload)\b/.test(text)) return { type: 'footage', lane: at ?? 1 }
  if (hazard) {
    return { type: 'hazard', item: ITEMS.find((i) => i.kind === hazard.kind), lane: at ?? 1 }
  }

  const thing = text.match(/^ (?:there s |there is |theres |a |an |the |some )*(.+?) (?:in|on) (?:the )?(?:lane \w+|\w+ lane)/)
  if (thing && at != null) {
    const label = thing[1].toUpperCase().slice(0, 10).trim()
    return { type: 'hazard', item: { kind: 'custom-road', label, scope: 'road' }, lane: at }
  }

  return { type: 'error', text: `I DIDN'T CATCH THAT. ${HELP}` }
}
