"use client"

import { useEffect, useRef } from "react"

/* One-shot particle burst that fires from an anchor point, settles into a
   brief living constellation, then fades itself out and calls onDone.

   Visual language is lifted from components/particle-bg.tsx (the old app-wide
   cursor field): same accent read from --tm-interactive (teal in dark, orange
   in light), same shockwave + radial-blast math. The difference is lifecycle —
   this is a celebration that auto-fades, not a persistent interactive field.

   Gating (desktop-only, reduced-motion) lives in the provider; by the time this
   mounts we are cleared to animate. */

function hexToRgb(hex: string): string {
  if (hex.startsWith("#") && hex.length === 7) {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `${r},${g},${b}`
  }
  return "0,245,212"
}

type Particle = { x: number; y: number; vx: number; vy: number; s: number; op: number; seed: number }
type Blast = { x: number; y: number; vx: number; vy: number; op: number; s: number }

export type ParticleMomentProps = {
  /** Viewport-px origin of the burst. Defaults to screen centre. */
  anchor?: { x: number; y: number }
  /** Total lifetime before onDone, ms. */
  durationMs?: number
  /** 0.5 = gentle, 1 = standard, 1.6 = big peak. Scales particle/blast count + force. */
  intensity?: number
  onDone: () => void
}

export function ParticleMoment({ anchor, durationMs = 3500, intensity = 1, onDone }: ParticleMomentProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let W = (canvas.width = window.innerWidth)
    let H = (canvas.height = window.innerHeight)
    const resize = () => {
      W = canvas.width = window.innerWidth
      H = canvas.height = window.innerHeight
    }
    window.addEventListener("resize", resize)

    const accentRgb = hexToRgb(
      getComputedStyle(document.documentElement).getPropertyValue("--tm-interactive").trim()
    )

    const cx = anchor?.x ?? W / 2
    const cy = anchor?.y ?? H / 2

    // Ambient field — drifts for the constellation look between blasts.
    const N = Math.round(90 * intensity)
    const pts: Particle[] = Array.from({ length: N }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      s: Math.random() * 1.4 + 0.3,
      op: Math.random() * 0.26 + 0.06,
      seed: Math.random() * 6.28,
    }))

    // Shockwave — push ambient particles outward from the anchor (mirrors
    // particle-bg onClick), so the whole field reacts to the moment.
    for (const p of pts) {
      const dx = p.x - cx, dy = p.y - cy
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < 360 && d > 0) {
        const f = (1 - d / 360) * 9 * intensity
        p.vx += (dx / d) * f
        p.vy += (dy / d) * f
      }
    }

    // Radial blast burst from the anchor.
    const blasts: Blast[] = []
    const blastN = Math.round(34 * intensity)
    for (let i = 0; i < blastN; i++) {
      const angle = (i / blastN) * Math.PI * 2 + Math.random() * 0.3
      const speed = (3.4 + Math.random() * 6.5) * intensity
      blasts.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        op: 0.85 + Math.random() * 0.15,
        s: 0.8 + Math.random() * 2.6,
      })
    }

    const CONN = 150
    const start = performance.now()
    let animId = 0
    let frame = 0

    function tick(now: number) {
      const elapsed = now - start
      const life = Math.min(1, elapsed / durationMs)
      // Ease-out fade: hold full, then drop over the back half.
      const fade = life < 0.45 ? 1 : 1 - (life - 0.45) / 0.55
      canvas!.style.opacity = String(Math.max(0, fade))

      ctx!.clearRect(0, 0, W, H)
      frame++

      // Particle-to-particle constellation edges.
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const a = pts[i], b = pts[j]
          const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy
          if (d2 < CONN * CONN) {
            const alpha = (1 - Math.sqrt(d2) / CONN) * 0.05
            ctx!.beginPath()
            ctx!.moveTo(a.x, a.y)
            ctx!.lineTo(b.x, b.y)
            ctx!.strokeStyle = `rgba(${accentRgb},${alpha})`
            ctx!.lineWidth = 0.5
            ctx!.stroke()
          }
        }
      }

      // Ambient physics — flow drift + damping + edge wrap.
      for (const p of pts) {
        const t = frame * 0.0065
        const angle = Math.sin(t + p.seed) * Math.cos(t * 0.73 + p.seed * 1.31) * Math.PI * 2
        p.vx += Math.cos(angle) * 0.02
        p.vy += Math.sin(angle) * 0.02
        p.vx *= 0.962; p.vy *= 0.962
        p.x += p.vx; p.y += p.vy
        if (p.x < -5) p.x += W + 10
        if (p.x > W + 5) p.x -= W + 10
        if (p.y < -5) p.y += H + 10
        if (p.y > H + 5) p.y -= H + 10
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.s, 0, 6.283)
        ctx!.fillStyle = `rgba(${accentRgb},${p.op})`
        ctx!.fill()
      }

      // Blast particles.
      for (let i = blasts.length - 1; i >= 0; i--) {
        const b = blasts[i]
        b.x += b.vx; b.y += b.vy
        b.vx *= 0.91; b.vy *= 0.91
        b.op *= 0.94
        if (b.op < 0.012) { blasts.splice(i, 1); continue }
        ctx!.beginPath()
        ctx!.arc(b.x, b.y, b.s, 0, 6.283)
        ctx!.fillStyle = `rgba(${accentRgb},${b.op})`
        ctx!.fill()
      }

      if (elapsed >= durationMs) {
        onDoneRef.current()
        return
      }
      animId = requestAnimationFrame(tick)
    }
    animId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener("resize", resize)
    }
  }, [anchor, durationMs, intensity])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "fixed", inset: 0,
        width: "100%", height: "100%",
        zIndex: 60, pointerEvents: "none",
      }}
    />
  )
}
