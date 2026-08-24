"use client"

import { useEffect, useRef } from "react"

function hexToRgb(hex: string): string {
  const h = hex.trim()
  if (h.startsWith("#") && h.length === 7) {
    const r = parseInt(h.slice(1, 3), 16)
    const g = parseInt(h.slice(3, 5), 16)
    const b = parseInt(h.slice(5, 7), 16)
    return `${r},${g},${b}`
  }
  return "79,199,246"
}

interface ParticleLoadingProps {
  message?: string
  height?: number
}

export function ParticleLoading({ message = "Loading…", height = 400 }: ParticleLoadingProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let W = 0, H = 0, animId = 0
    let accentRgb = "79,199,246"

    function readAccent() {
      const hex = getComputedStyle(document.documentElement).getPropertyValue("--tm-interactive").trim()
      accentRgb = hexToRgb(hex)
    }
    readAccent()

    function resize() {
      W = canvas!.width = wrap!.clientWidth || 600
      H = canvas!.height = wrap!.clientHeight || height
    }

    const ro = new ResizeObserver(() => resize())
    ro.observe(wrap)
    resize()

    const N = 40
    type P = { x: number; y: number; vx: number; vy: number; seed: number; s: number; op: number }
    const pts: P[] = Array.from({ length: N }, () => ({
      x: Math.random() * (W || 600),
      y: Math.random() * (H || height),
      vx: 0, vy: 0,
      seed: Math.random() * 6.28,
      s: Math.random() * 1.4 + 0.3,
      op: Math.random() * 0.28 + 0.06,
    }))

    let mx = (W || 600) / 2, my = (H || height) / 2
    let lx = mx, ly = my
    let cursorActive = false

    const onMove = (e: MouseEvent) => {
      const rect = canvas!.getBoundingClientRect()
      mx = e.clientX - rect.left
      my = e.clientY - rect.top
      cursorActive = true
    }
    const onLeave = () => { cursorActive = false }
    canvas.addEventListener("mousemove", onMove)
    canvas.addEventListener("mouseleave", onLeave)

    const CONN = 90
    let frame = 0

    function tick() {
      animId = requestAnimationFrame(tick)
      frame++
      lx += (mx - lx) * 0.08
      ly += (my - ly) * 0.08
      ctx!.clearRect(0, 0, W, H)
      const rgb = accentRgb

      // Particle-to-particle connections
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y
          const d2 = dx * dx + dy * dy
          if (d2 < CONN * CONN) {
            const alpha = (1 - Math.sqrt(d2) / CONN) * 0.045
            ctx!.beginPath()
            ctx!.moveTo(pts[i].x, pts[i].y)
            ctx!.lineTo(pts[j].x, pts[j].y)
            ctx!.strokeStyle = `rgba(${rgb},${alpha})`
            ctx!.lineWidth = 0.5
            ctx!.stroke()
          }
        }
      }

      // Cursor-to-particle edges
      if (cursorActive) {
        for (const p of pts) {
          const dx = lx - p.x, dy = ly - p.y
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < 200 && d > 4) {
            ctx!.beginPath()
            ctx!.moveTo(p.x, p.y)
            ctx!.lineTo(lx, ly)
            ctx!.strokeStyle = `rgba(${rgb},${(1 - d / 200) * 0.12})`
            ctx!.lineWidth = 0.65
            ctx!.stroke()
          }
        }
      }

      // Particle physics + draw
      for (const p of pts) {
        const t = frame * 0.006
        const angle = Math.sin(t + p.seed) * Math.cos(t * 0.7 + p.seed * 1.3) * Math.PI * 2
        p.vx += Math.cos(angle) * 0.022
        p.vy += Math.sin(angle) * 0.022

        if (cursorActive) {
          const dx = lx - p.x, dy = ly - p.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 160 && dist > 0) {
            const f = (1 - dist / 160) * 0.18
            p.vx += (dx / dist) * f
            p.vy += (dy / dist) * f
          }
        }

        p.vx *= 0.965; p.vy *= 0.965
        p.x += p.vx; p.y += p.vy
        if (p.x < -5) p.x += W + 10
        if (p.x > W + 5) p.x -= W + 10
        if (p.y < -5) p.y += H + 10
        if (p.y > H + 5) p.y -= H + 10

        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.s, 0, 6.283)
        ctx!.fillStyle = `rgba(${rgb},${p.op})`
        ctx!.fill()
      }
    }

    tick()

    return () => {
      cancelAnimationFrame(animId)
      ro.disconnect()
      canvas.removeEventListener("mousemove", onMove)
      canvas.removeEventListener("mouseleave", onLeave)
    }
  }, [height])

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", height, overflow: "hidden" }}>
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        pointerEvents: "none",
      }}>
        <span style={{
          fontFamily: "var(--tm-font-mono, 'SF Mono', monospace)",
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--tm-text-faint)",
          animation: "pulse 1.8s ease-in-out infinite",
        }}>
          {message}
        </span>
      </div>
    </div>
  )
}
