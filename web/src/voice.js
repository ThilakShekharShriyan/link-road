const synth = typeof window !== 'undefined' ? window.speechSynthesis : null

const STYLE = {
  narrator: { pitch: 1, rate: 1.05 },
  BLUE: { pitch: 1.1, rate: 1.1 },
  SILVER: { pitch: 1.4, rate: 1.15 },
  TRUCK: { pitch: 0.55, rate: 0.92 },
  CAB: { pitch: 1.25, rate: 1.2 },
  VAN: { pitch: 0.85, rate: 1.0 },
  SUV: { pitch: 0.7, rate: 1.0 },
}

const PREFERRED = ['Samantha', 'Google US English', 'Alex', 'Daniel', 'Karen']

let voice = null

function pickVoice() {
  const english = synth.getVoices().filter((v) => v.lang.startsWith('en'))
  voice =
    PREFERRED.map((name) => english.find((v) => v.name.includes(name))).find(Boolean) ?? english[0] ?? null
}

if (synth) {
  pickVoice()
  synth.addEventListener?.('voiceschanged', pickVoice)
}

export const voiceSupported = Boolean(synth)

function speakable(speaker, text) {
  const line = text
    .toLowerCase()
    .replace(/(\d+) m\b/g, '$1 meters')
    .replace(/\bmph\b/g, 'miles per hour')
    .replace(/(\d)\s?g\b/g, '$1 g')
    .replace(/\bspd\b/g, 'speed')
    .replace(/\bsuv\b/g, 'S.U.V.')
    .replace(/\bv2v\b/g, 'V to V')
    .replace(/\.\.\./g, '.')
  return speaker ? `${speaker.toLowerCase()}. ${line}` : line
}

export function stopSpeaking() {
  synth?.cancel()
}

export function speak(speaker, text) {
  if (!synth) return Promise.resolve()
  synth.cancel()
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(speakable(speaker, text))
    const style = STYLE[speaker] ?? STYLE.narrator
    utterance.pitch = style.pitch
    utterance.rate = style.rate
    if (voice) utterance.voice = voice
    const timeout = setTimeout(resolve, 1500 + text.length * 90)
    const finish = () => {
      clearTimeout(timeout)
      resolve()
    }
    utterance.onend = finish
    utterance.onerror = finish
    synth.speak(utterance)
  })
}
