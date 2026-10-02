import * as ort from 'onnxruntime-web/wasm'
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import { detectPotholes } from './pothole.js'

ort.env.wasm.wasmPaths = { wasm: wasmUrl }
ort.env.wasm.numThreads = 1

const MODEL_URL = '/models/yolov8n.onnx'
const SIZE = 640
const MIN_SCORE = 0.28
const NMS_IOU = 0.45
const MAX_FRAMES = 36
const REPORT_W = 480

export const COCO = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 'traffic light',
  'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
  'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
  'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard',
  'tennis racket', 'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
  'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
  'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard',
  'cell phone', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase',
  'scissors', 'teddy bear', 'hair drier', 'toothbrush',
]

const ROAD = new Set([
  'person', 'bicycle', 'car', 'motorcycle', 'bus', 'train', 'truck', 'traffic light', 'fire hydrant',
  'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'backpack',
  'umbrella', 'handbag', 'suitcase', 'skateboard', 'pothole',
])

const HOLE_LIKE = new Set(['toilet', 'bowl', 'sink', 'donut', 'sports ball', 'frisbee', 'clock'])

const INDOOR = new Set([
  'bed', 'couch', 'dining table', 'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'microwave', 'oven',
  'toaster', 'refrigerator', 'hair drier', 'toothbrush', 'wine glass', 'cup', 'fork', 'knife', 'spoon',
  'banana', 'apple', 'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'cake', 'teddy bear',
  'vase', 'scissors', 'book', 'chair', 'potted plant',
])

let session = null

export function loadModel() {
  session = session || ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'] })
  return session
}

function iou(a, b) {
  const x0 = Math.max(a.x, b.x)
  const y0 = Math.max(a.y, b.y)
  const x1 = Math.min(a.x + a.w, b.x + b.w)
  const y1 = Math.min(a.y + a.h, b.y + a.h)
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0)
  return inter / (a.w * a.h + b.w * b.h - inter || 1)
}

function nms(boxes) {
  const kept = []
  for (const b of boxes.sort((p, q) => q.score - p.score)) {
    if (kept.every((k) => k.label !== b.label || iou(k, b) < NMS_IOU)) kept.push(b)
  }
  return kept
}

function onRoad(d, h) {
  const cy = d.y + d.h / 2
  return cy > h * 0.26 && d.y + d.h > h * 0.34
}

function cleanup(dets, h) {
  const mapped = []
  for (const d of dets) {
    if (INDOOR.has(d.label)) continue
    if (HOLE_LIKE.has(d.label) && onRoad(d, h)) {
      mapped.push({ ...d, label: 'pothole' })
      continue
    }
    if (HOLE_LIKE.has(d.label)) continue
    mapped.push(d)
  }
  return mapped
}

async function detect(source, w, h) {
  const model = await loadModel()
  const scale = Math.min(SIZE / w, SIZE / h)
  const padX = (SIZE - w * scale) / 2
  const padY = (SIZE - h * scale) / 2
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = 'rgb(114,114,114)'
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.drawImage(source, padX, padY, w * scale, h * scale)

  const { data } = ctx.getImageData(0, 0, SIZE, SIZE)
  const plane = SIZE * SIZE
  const input = new Float32Array(plane * 3)
  for (let i = 0; i < plane; i += 1) {
    input[i] = data[i * 4] / 255
    input[plane + i] = data[i * 4 + 1] / 255
    input[plane * 2 + i] = data[i * 4 + 2] / 255
  }

  const feeds = { [model.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]) }
  const output = (await model.run(feeds))[model.outputNames[0]]
  const [, rows, count] = output.dims
  const out = output.data
  const boxes = []
  for (let i = 0; i < count; i += 1) {
    let cls = -1
    let score = MIN_SCORE
    for (let k = 4; k < rows; k += 1) {
      const s = out[k * count + i]
      if (s > score) {
        score = s
        cls = k - 4
      }
    }
    if (cls < 0) continue
    const bw = out[2 * count + i] / scale
    const bh = out[3 * count + i] / scale
    const x = (out[i] - padX) / scale - bw / 2
    const y = (out[count + i] - padY) / scale - bh / 2
    boxes.push({ cls, label: COCO[cls], score, x, y, w: bw, h: bh })
  }
  const yolo = cleanup(nms(boxes), h)
  const holes = detectPotholes(source, w, h)
  const merged = nms([...yolo, ...holes])
  return merged.filter((d) => {
    if (d.label !== 'pothole') return true
    return !merged.some((o) => o.label !== 'pothole' && ROAD.has(o.label) && iou(d, o) > 0.45)
  })
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('IMAGE WOULD NOT LOAD'))
    img.src = url
  })
}

function loadVideo(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.onloadeddata = () => resolve(video)
    video.onerror = () => reject(new Error('VIDEO WOULD NOT LOAD'))
    video.src = url
  })
}

function seek(video, time) {
  return new Promise((resolve) => {
    video.onseeked = () => resolve()
    video.currentTime = time
  })
}

function snapshot(source, w, h) {
  const canvas = document.createElement('canvas')
  canvas.width = REPORT_W
  canvas.height = Math.round((REPORT_W * h) / w)
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}

function frameScore(dets) {
  let s = 0
  for (const d of dets) {
    if (d.label === 'pothole') s += 6 + d.score * 2
    else if (ROAD.has(d.label)) s += 1 + d.score
    else s += 0.15 * d.score
  }
  return s
}

function sampleTimes(duration) {
  if (!duration || duration < 0.4) return [0]
  const n = Math.min(MAX_FRAMES, Math.max(8, Math.round(duration * 1.5)))
  const times = []
  for (let i = 0; i < n; i += 1) times.push(((i + 0.5) / n) * duration)
  return times
}

function catalogOf(samples) {
  const counts = new Map()
  for (const sample of samples) {
    const seen = new Set()
    for (const d of sample.detections) {
      if (seen.has(d.label)) continue
      seen.add(d.label)
      counts.set(d.label, (counts.get(d.label) || 0) + 1)
    }
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([label, n]) => `${n}× ${label.toUpperCase()}`)
    .join(', ')
}

export async function analyzeMedia(media, onProgress) {
  const started = performance.now()
  let best = null
  const samples = []

  if (media.type === 'image') {
    const img = await loadImage(media.url)
    const w = img.naturalWidth
    const h = img.naturalHeight
    const detections = await detect(img, w, h)
    best = { detections, frame: snapshot(img, w, h), w, h, time: 0 }
    samples.push({ time: 0, detections })
    onProgress?.({ frames: 1, total: 1, time: 0 })
  } else {
    const video = await loadVideo(media.url)
    const w = video.videoWidth
    const h = video.videoHeight
    const times = sampleTimes(video.duration || 0)
    for (let i = 0; i < times.length; i += 1) {
      const time = times[i]
      await seek(video, time)
      const detections = await detect(video, w, h)
      const sample = { time, detections, frame: snapshot(video, w, h), w, h }
      samples.push(sample)
      if (!best || frameScore(detections) > frameScore(best.detections)) best = sample
      onProgress?.({ frames: i + 1, total: times.length, time })
    }
    video.removeAttribute('src')
    video.load()
  }

  const catalog = catalogOf(samples)
  const holes = samples.reduce((n, s) => n + s.detections.filter((d) => d.label === 'pothole').length, 0)
  return {
    ...best,
    catalog,
    holes,
    span: samples.length ? samples[samples.length - 1].time : 0,
    frames: samples.length,
    ms: Math.round(performance.now() - started),
  }
}
