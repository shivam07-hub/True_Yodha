"use client"

import { useEffect, useRef } from "react"

function hexToRgb(hex: string): string {
  if (hex.startsWith("#") && hex.length === 7) {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `${r},${g},${b}`
  }
  return "0,245,212"
}

type Particle = {
  x: number; y: number; vx: number; vy: number
  seed: number; s: number; op: number
  sphereAngle: number; sphereR: number
}
type BlastParticle = { x: number; y: number; vx: number; vy: number; op: number; s: number }

export function ParticleBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let W = 0, H = 0, animId = 0
    let accentRgb = "0,245,212"

    function readAccent() {
      const hex = getComputedStyle(document.documentElement)
        .getPropertyValue("--tm-accent").trim()
      accentRgb = hexToRgb(hex)
    }
    readAccent()

    const observer = new MutationObserver(() => setTimeout(readAccent, 210))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-accent"] })

    function resize() {
      W = canvas!.width = window.innerWidth
      H = canvas!.height = window.innerHeight
    }
    resize()
    window.addEventListener("resize", resize)

    const N = 120
    const pts: Particle[] = Array.from({ length: N }, (_, i) => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: 0, vy: 0,
      seed: Math.random() * 6.28,
      s: Math.random() * 1.4 + 0.3,
      op: Math.random() * 0.28 + 0.06,
      // Sphere home — evenly distributed around circle with ±radial imperfection
      sphereAngle: (i / N) * Math.PI * 2 + (Math.random() - 0.5) * 0.5,
      sphereR: 0.82 + Math.random() * 0.36, // radius multiplier for imperfection
    }))

    let mx = W / 2, my = H / 2
    let lx = W / 2, ly = H / 2
    let lastMoveTime = Date.now()
    let cursorInWindow = true
    let idleStart = 0

    // Glide attractor — set after click to guide particles toward Progress nav
    let glide: { x: number; y: number; strength: number } | null = null

    const blasts: BlastParticle[] = []

    const onMove = (e: MouseEvent) => {
      mx = e.clientX; my = e.clientY
      lastMoveTime = Date.now()
      cursorInWindow = true
      idleStart = 0
    }
    const onLeave = () => { cursorInWindow = false }
    const onEnter = () => { cursorInWindow = true; lastMoveTime = Date.now(); idleStart = 0 }

    const onClick = (e: MouseEvent) => {
      const cx = e.clientX, cy = e.clientY

      // Shockwave push — scatter nearby particles outward
      for (const p of pts) {
        const dx = p.x - cx, dy = p.y - cy
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < 320 && d > 0) {
          const f = (1 - d / 320) * 8
          p.vx += (dx / d) * f
          p.vy += (dy / d) * f
        }
      }

      // 28 radial blast particles — no ring, just raw particle burst
      for (let i = 0; i < 28; i++) {
        const angle = (i / 28) * Math.PI * 2 + Math.random() * 0.3
        const speed = 3 + Math.random() * 6
        blasts.push({
          x: cx, y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          op: 0.85 + Math.random() * 0.15,
          s: 0.8 + Math.random() * 2.4,
        })
      }

      // Glide attractor toward Progress nav item (sidebar, ~5th item)
      // Sidebar is 64px wide → center x=32. Progress item y ≈ 320px from top.
      glide = { x: 32, y: 320, strength: 0.9 }
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("click", onClick)
    document.addEventListener("mouseleave", onLeave)
    document.addEventListener("mouseenter", onEnter)

    // Doubled base connections + doubled cursor radius
    const CONN = 145        // was 110 — more base connections across canvas
    const CURSOR_R = 360    // was 180 — double cursor-edge reach

    let frame = 0

    function tick() {
      animId = requestAnimationFrame(tick)
      frame++
      if (canvas!.width !== window.innerWidth) resize()

      // Cursor lerp — higher speed (was 0.038)
      lx += (mx - lx) * 0.082
      ly += (my - ly) * 0.082

      ctx!.clearRect(0, 0, W, H)
      const rgb = accentRgb

      // ── Idle detection ────────────────────────────────────────
      const now = Date.now()
      const isIdle = !cursorInWindow || (now - lastMoveTime > 2500)
      if (isIdle && idleStart === 0) idleStart = now
      if (!isIdle) idleStart = 0
      const idleFactor = idleStart > 0 ? Math.min(1, (now - idleStart) / 900) : 0
      const sphereRadius = Math.min(W, H) * 0.17
      const sphereCx = W / 2, sphereCy = H / 2

      // ── Glide decay ───────────────────────────────────────────
      if (glide) {
        glide.strength *= 0.994
        if (glide.strength < 0.015) glide = null
      }

      // ── Particle-to-particle connections (doubled reach) ─────
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const a = pts[i], b = pts[j]
          const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy
          if (d2 < CONN * CONN) {
            const alpha = (1 - Math.sqrt(d2) / CONN) * 0.042
            ctx!.beginPath()
            ctx!.moveTo(a.x, a.y)
            ctx!.lineTo(b.x, b.y)
            ctx!.strokeStyle = `rgba(${rgb},${alpha})`
            ctx!.lineWidth = 0.5
            ctx!.stroke()
          }
        }
      }

      // ── Cursor-to-particle edges (double cursor distance) ────
      if (!isIdle) {
        for (let i = 0; i < N; i++) {
          const p = pts[i]
          const dx = lx - p.x, dy = ly - p.y
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < CURSOR_R && d > 4) {
            const alpha = (1 - d / CURSOR_R) * 0.13
            ctx!.beginPath()
            ctx!.moveTo(p.x, p.y)
            ctx!.lineTo(lx, ly)
            ctx!.strokeStyle = `rgba(${rgb},${alpha})`
            ctx!.lineWidth = 0.65
            ctx!.stroke()
          }
        }
      }

      // ── Particle physics + draw ───────────────────────────────
      for (const p of pts) {
        const t = frame * 0.0065
        const angle = Math.sin(t + p.seed) * Math.cos(t * 0.73 + p.seed * 1.31) * Math.PI * 2
        p.vx += Math.cos(angle) * 0.025
        p.vy += Math.sin(angle) * 0.025

        // Cursor attraction (only when not idle)
        if (!isIdle) {
          const dx = lx - p.x, dy = ly - p.y, dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 200 && dist > 0) {
            const f = (1 - dist / 200) * 0.2
            p.vx += (dx / dist) * f
            p.vy += (dy / dist) * f
          }
        }

        // Idle: spring toward sphere home position (imperfect sphere)
        if (idleFactor > 0) {
          const homeX = sphereCx + Math.cos(p.sphereAngle) * sphereRadius * p.sphereR
          const homeY = sphereCy + Math.sin(p.sphereAngle) * sphereRadius * p.sphereR
          p.vx += (homeX - p.x) * idleFactor * 0.055
          p.vy += (homeY - p.y) * idleFactor * 0.055
        }

        // Glide: gentle pull toward Progress nav
        if (glide) {
          const dx = glide.x - p.x, dy = glide.y - p.y
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d > 0) {
            p.vx += (dx / d) * glide.strength * 0.18
            p.vy += (dy / d) * glide.strength * 0.18
          }
        }

        p.vx *= 0.964; p.vy *= 0.964
        p.x += p.vx; p.y += p.vy

        if (idleFactor < 0.8) {
          // Only wrap when not in sphere mode
          if (p.x < -5) p.x += W + 10
          if (p.x > W + 5) p.x -= W + 10
          if (p.y < -5) p.y += H + 10
          if (p.y > H + 5) p.y -= H + 10
        }

        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.s, 0, 6.283)
        ctx!.fillStyle = `rgba(${rgb},${p.op})`
        ctx!.fill()
      }

      // ── Blast particles ───────────────────────────────────────
      for (let i = blasts.length - 1; i >= 0; i--) {
        const b = blasts[i]
        b.x += b.vx; b.y += b.vy
        b.vx *= 0.91; b.vy *= 0.91
        b.op *= 0.93
        if (b.op < 0.012) { blasts.splice(i, 1); continue }
        ctx!.beginPath()
        ctx!.arc(b.x, b.y, b.s, 0, 6.283)
        ctx!.fillStyle = `rgba(${rgb},${b.op})`
        ctx!.fill()
      }
    }

    tick()

    return () => {
      cancelAnimationFrame(animId)
      observer.disconnect()
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("click", onClick)
      document.removeEventListener("mouseleave", onLeave)
      document.removeEventListener("mouseenter", onEnter)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed", inset: 0,
        width: "100%", height: "100%",
        zIndex: 0, pointerEvents: "none",
      }}
    />
  )
}
