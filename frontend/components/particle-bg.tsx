"use client"

import { useEffect, useRef } from "react"

export function ParticleBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let W = 0, H = 0, animId = 0

    function resize() {
      W = canvas!.width = window.innerWidth
      H = canvas!.height = window.innerHeight
    }
    resize()
    window.addEventListener("resize", resize)

    const N = 120
    const pts = Array.from({ length: N }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: 0, vy: 0,
      seed: Math.random() * 6.28,
      s: Math.random() * 1.4 + 0.3,
      op: Math.random() * 0.28 + 0.06,
      col: Math.random() > 0.72 ? "v" : "t",
    }))

    let mx = 800, my = 400, lx = 800, ly = 400
    const ripples: { x: number; y: number; r: number; op: number }[] = []

    const onMove = (e: MouseEvent) => { mx = e.clientX; my = e.clientY }
    const onClick = (e: MouseEvent) => ripples.push({ x: e.clientX, y: e.clientY, r: 0, op: 0.8 })
    window.addEventListener("mousemove", onMove)
    window.addEventListener("click", onClick)

    const CONN = 110
    let frame = 0

    function tick() {
      animId = requestAnimationFrame(tick)
      frame++
      if (canvas!.width !== window.innerWidth) resize()

      lx += (mx - lx) * 0.038
      ly += (my - ly) * 0.038

      ctx!.clearRect(0, 0, W, H)

      const tR = "0,245,212", vR = "123,47,255"

      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const a = pts[i], b = pts[j]
          const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy
          if (d2 < CONN * CONN) {
            const alpha = (1 - Math.sqrt(d2) / CONN) * 0.045
            ctx!.beginPath()
            ctx!.moveTo(a.x, a.y)
            ctx!.lineTo(b.x, b.y)
            ctx!.strokeStyle = `rgba(${tR},${alpha})`
            ctx!.lineWidth = 0.5
            ctx!.stroke()
          }
        }
      }

      for (const p of pts) {
        const t = frame * 0.0065
        const angle = Math.sin(t + p.seed) * Math.cos(t * 0.73 + p.seed * 1.31) * Math.PI * 2
        p.vx += Math.cos(angle) * 0.025
        p.vy += Math.sin(angle) * 0.025

        const dx = lx - p.x, dy = ly - p.y, dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 200 && dist > 0) {
          const f = (1 - dist / 200) * 0.2
          p.vx += dx / dist * f
          p.vy += dy / dist * f
        }

        for (const rip of ripples) {
          const rx = p.x - rip.x, ry = p.y - rip.y, rd = Math.sqrt(rx * rx + ry * ry)
          if (rd > 1 && Math.abs(rd - rip.r) < 50) {
            const f = (1 - Math.abs(rd - rip.r) / 50) * 2.5
            p.vx += rx / rd * f
            p.vy += ry / rd * f
          }
        }

        p.vx *= 0.964; p.vy *= 0.964
        p.x += p.vx; p.y += p.vy
        if (p.x < -5) p.x += W + 10
        if (p.x > W + 5) p.x -= W + 10
        if (p.y < -5) p.y += H + 10
        if (p.y > H + 5) p.y -= H + 10

        const rgb = p.col === "v" ? vR : tR
        const op = p.col === "v" ? p.op * 0.45 : p.op
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.s, 0, 6.283)
        ctx!.fillStyle = `rgba(${rgb},${op})`
        ctx!.fill()
      }

      for (let i = ripples.length - 1; i >= 0; i--) {
        const rip = ripples[i]
        rip.r += 7; rip.op *= 0.916
        if (rip.op < 0.008) { ripples.splice(i, 1); continue }
        ctx!.beginPath()
        ctx!.arc(rip.x, rip.y, rip.r, 0, 6.283)
        ctx!.strokeStyle = `rgba(${tR},${rip.op})`
        ctx!.lineWidth = 1.5
        ctx!.stroke()
      }
    }

    tick()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("click", onClick)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 0, pointerEvents: "none" }}
    />
  )
}
