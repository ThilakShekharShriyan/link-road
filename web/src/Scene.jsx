import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { render, screenToRoad } from './sim/render.js'
import { step } from './sim/world.js'

const DT = 1 / 120

const Scene = forwardRef(function Scene({ simRef, hoverRef }, ref) {
  const canvasRef = useRef(null)
  const camRef = useRef(null)

  useImperativeHandle(ref, () => ({
    toRoad(clientX, clientY) {
      const canvas = canvasRef.current
      if (!canvas || !camRef.current) return null
      const rect = canvas.getBoundingClientRect()
      const sx = clientX - rect.left
      const sy = clientY - rect.top
      if (sx < 0 || sy < 0 || sx > rect.width || sy > rect.height) return null
      return screenToRoad(camRef.current, sx, sy)
    },
  }))

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let size = { w: 0, h: 0, dpr: 1 }
    let last = performance.now()
    let acc = 0
    let raf = 0

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      size = { w: rect.width, h: rect.height, dpr }
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const frame = () => {
      const now = performance.now()
      const elapsed = now - last
      if (elapsed < 8) return
      last = now
      acc += Math.min(0.1, Math.max(0, elapsed / 1000))
      const sim = simRef.current
      while (acc >= DT) {
        step(sim, DT)
        acc -= DT
      }
      if (!size.w || !size.h) return
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
      camRef.current = render(ctx, sim, size.w, size.h, hoverRef.current)
    }
    const loop = () => {
      frame()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    const watchdog = setInterval(frame, 33)

    return () => {
      cancelAnimationFrame(raf)
      clearInterval(watchdog)
      observer.disconnect()
    }
  }, [simRef, hoverRef])

  return <canvas ref={canvasRef} className="scene" />
})

export default Scene
