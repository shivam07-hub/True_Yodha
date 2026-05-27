"use client"

/* Idle particle sphere with mouse-repel + click-scatter.
   Ported from the Building-front-end-brand handoff (chrome.jsx).
   Accepts an accent so /welcome renders teal and /myrology amethyst.
   Desktop-only (no cursor on touch → the field has nothing to react to). */

import { useEffect, useRef } from "react"
import { useViewport } from "@/mobile"

interface BrandParticlesProps {
  density?: number
  accent?: string
}

export function BrandParticles({ density = 0.5, accent = "#00F5D4" }: BrandParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { isDesktop } = useViewport()

  useEffect(() => {
    if (!isDesktop) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    let w = 0
    let h = 0
    let particles: { x: number; y: number; vx: number; vy: number; r: number; o: number }[] = []
    let raf = 0
    const mouse = { x: -9999, y: -9999, blast: 0 }

    function resize() {
      if (!canvas || !ctx) return
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.floor(w * h * 0.00008 * density)
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        r: Math.random() * 1.2 + 0.4,
        o: Math.random() * 0.5 + 0.15,
      }))
    }

    function tick() {
      if (!ctx) return
      ctx.clearRect(0, 0, w, h)
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0) p.x = w
        if (p.x > w) p.x = 0
        if (p.y < 0) p.y = h
        if (p.y > h) p.y = 0
        p.vx += (w / 2 - p.x) * 0.000005
        p.vy += (h / 2 - p.y) * 0.000005
        const dx = p.x - mouse.x
        const dy = p.y - mouse.y
        const d = Math.hypot(dx, dy) || 0.0001
        if (d < 140 + mouse.blast * 200) {
          const f = (140 - d) * 0.0008 + mouse.blast * 0.02
          p.vx += (dx / d) * f
          p.vy += (dy / d) * f
        }
        p.vx *= 0.985
        p.vy *= 0.985
        ctx.globalAlpha = p.o
        ctx.fillStyle = accent
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
      mouse.blast *= 0.92
      raf = requestAnimationFrame(tick)
    }

    function onMove(e: MouseEvent) {
      if (!canvas) return
      const r = canvas.getBoundingClientRect()
      mouse.x = e.clientX - r.left
      mouse.y = e.clientY - r.top
    }
    function onLeave() {
      mouse.x = -9999
      mouse.y = -9999
    }
    function onClick() {
      mouse.blast = 1
    }

    resize()
    tick()
    window.addEventListener("resize", resize)
    canvas.addEventListener("mousemove", onMove)
    canvas.addEventListener("mouseleave", onLeave)
    canvas.addEventListener("click", onClick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
      canvas.removeEventListener("mousemove", onMove)
      canvas.removeEventListener("mouseleave", onLeave)
      canvas.removeEventListener("click", onClick)
    }
  }, [density, accent, isDesktop])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.6 }}
    />
  )
}
