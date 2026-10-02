function grayAt(data, i) {
  return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
}

function blurGray(gray, w, h, radius) {
  const out = new Float32Array(gray.length)
  const tmp = new Float32Array(gray.length)
  for (let y = 0; y < h; y += 1) {
    let sum = 0
    let count = 0
    for (let x = 0; x < w; x += 1) {
      const add = x + radius < w ? gray[y * w + x + radius] : 0
      const rem = x - radius - 1 >= 0 ? gray[y * w + x - radius - 1] : 0
      if (x === 0) {
        sum = 0
        count = 0
        for (let k = 0; k <= radius && k < w; k += 1) {
          sum += gray[y * w + k]
          count += 1
        }
      } else {
        if (x + radius < w) {
          sum += add
          count += 1
        }
        if (x - radius - 1 >= 0) {
          sum -= rem
          count -= 1
        }
      }
      tmp[y * w + x] = sum / (count || 1)
    }
  }
  for (let x = 0; x < w; x += 1) {
    let sum = 0
    let count = 0
    for (let y = 0; y < h; y += 1) {
      if (y === 0) {
        sum = 0
        count = 0
        for (let k = 0; k <= radius && k < h; k += 1) {
          sum += tmp[k * w + x]
          count += 1
        }
      } else {
        if (y + radius < h) {
          sum += tmp[(y + radius) * w + x]
          count += 1
        }
        if (y - radius - 1 >= 0) {
          sum -= tmp[(y - radius - 1) * w + x]
          count -= 1
        }
      }
      out[y * w + x] = sum / (count || 1)
    }
  }
  return out
}

function boxesFromMask(mask, w, h, gray) {
  const parent = new Int32Array(w * h).fill(-1)
  const find = (a) => {
    let i = a
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  const link = (a, b) => {
    const pa = find(a)
    const pb = find(b)
    if (pa !== pb) parent[pb] = pa
  }

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x
      if (!mask[i]) continue
      parent[i] = i
      if (x > 0 && mask[i - 1]) link(i, i - 1)
      if (y > 0 && mask[i - w]) link(i, i - w)
    }
  }

  const stats = new Map()
  for (let i = 0; i < parent.length; i += 1) {
    if (parent[i] < 0) continue
    const root = find(i)
    const x = i % w
    const y = (i - x) / w
    let s = stats.get(root)
    if (!s) {
      s = { minX: x, minY: y, maxX: x, maxY: y, area: 0, sum: 0 }
      stats.set(root, s)
    }
    s.minX = Math.min(s.minX, x)
    s.minY = Math.min(s.minY, y)
    s.maxX = Math.max(s.maxX, x)
    s.maxY = Math.max(s.maxY, y)
    s.area += 1
    s.sum += gray[i]
  }
  return [...stats.values()]
}

export function detectPotholes(source, srcW, srcH) {
  const w = 320
  const h = Math.max(1, Math.round((w * srcH) / srcW))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(source, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)
  const gray = new Float32Array(w * h)
  for (let i = 0, p = 0; i < gray.length; i += 1, p += 4) gray[i] = grayAt(data, p)
  const mean = blurGray(gray, w, h, 12)

  const y0 = Math.floor(h * 0.28)
  const y1 = Math.floor(h * 0.94)
  const mask = new Uint8Array(w * h)
  for (let y = y0; y < y1; y += 1) {
    for (let x = 2; x < w - 2; x += 1) {
      const i = y * w + x
      const g = gray[i]
      if (g < 82 && g < mean[i] - 16) mask[i] = 1
    }
  }

  const road = (y1 - y0) * w
  const minArea = Math.max(28, road * 0.0012)
  const maxArea = road * 0.07
  const sx = srcW / w
  const sy = srcH / h
  const boxes = []
  for (const blob of boxesFromMask(mask, w, h, gray)) {
    const bw = blob.maxX - blob.minX + 1
    const bh = blob.maxY - blob.minY + 1
    if (blob.area < minArea || blob.area > maxArea) continue
    const aspect = bw / bh
    if (aspect < 0.35 || aspect > 2.8) continue
    if (blob.area / (bw * bh) < 0.32) continue
    const avg = blob.sum / blob.area
    if (avg > 78) continue
    const score = Math.min(0.92, 0.42 + (78 - avg) / 120 + blob.area / (maxArea * 3))
    boxes.push({
      cls: -1,
      label: 'pothole',
      score,
      x: blob.minX * sx,
      y: blob.minY * sy,
      w: bw * sx,
      h: bh * sy,
    })
  }
  return boxes
}
