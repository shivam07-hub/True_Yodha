"use client"

import { useEffect, useRef, useMemo } from "react"
import type { GapSkill, UserSkillsByDomain } from "@/lib/api"

interface OrganicSkillGraphProps {
  userSkills: UserSkillsByDomain
  gapSkills?: GapSkill[]
}

interface PhysNode {
  id: string
  label: string
  level: number
  domain: string
  hasProof: boolean
  isGap: boolean
  r: number
  x: number; y: number
  vx: number; vy: number
}

interface PhysEdge {
  a: number; b: number
  restLen: number; k: number
  isGap: boolean
}

function hexToRgb(hex: string): string {
  const h = hex.trim()
  if (h.startsWith("#") && h.length === 7) {
    return `${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}`
  }
  return "0,245,212"
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

export function OrganicSkillGraph({ userSkills, gapSkills = [] }: OrganicSkillGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const topology = useMemo(() => {
    const nodes: Omit<PhysNode, "x"|"y"|"vx"|"vy">[] = []
    const edges: PhysEdge[] = []

    for (const [domain, items] of Object.entries(userSkills.by_domain)) {
      for (const item of items) {
        nodes.push({
          id: `skill:${item.key}`,
          label: item.display_name,
          level: item.level,
          domain,
          hasProof: !!item.evidence_text,
          isGap: false,
          r: 4 + Math.min(item.level, 5) * 2.2,
        })
      }
    }

    for (const gap of gapSkills.slice(0, 18)) {
      nodes.push({
        id: `gap:${gap.skill}`,
        label: gap.skill,
        level: gap.target_level,
        domain: "__gap__",
        hasProof: false,
        isGap: true,
        r: 5 + Math.min(gap.target_level, 4) * 1.5,
      })
    }

    // Within-domain edges
    const byDomain = new Map<string, number[]>()
    nodes.forEach((n, i) => {
      if (n.isGap) return
      if (!byDomain.has(n.domain)) byDomain.set(n.domain, [])
      byDomain.get(n.domain)!.push(i)
    })
    for (const [, group] of Array.from(byDomain)) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          if (group.length <= 5 || hashStr(`${group[i]}:${group[j]}`) % 3 !== 2) {
            edges.push({ a: group[i], b: group[j], restLen: 85, k: 0.022, isGap: false })
          }
        }
      }
    }

    // Gap → nearest skill edges
    const skillIdxs = nodes.map((_, i) => i).filter(i => !nodes[i].isGap)
    for (let gi = 0; gi < nodes.length; gi++) {
      if (!nodes[gi].isGap) continue
      const gWords = new Set(nodes[gi].label.toLowerCase().split(/\W+/).filter(Boolean))
      let best = skillIdxs[0] ?? -1, bestScore = -1
      for (const si of skillIdxs) {
        const score = nodes[si].label.toLowerCase().split(/\W+/).filter(w => gWords.has(w)).length
        if (score > bestScore) { bestScore = score; best = si }
      }
      if (best !== -1) edges.push({ a: gi, b: best, restLen: 140, k: 0.008, isGap: true })
    }

    return { nodes, edges }
  }, [userSkills, gapSkills])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let W = 0, H = 0, animId = 0, frame = 0
    let dpr = 1
    let accentRgb = "0,245,212"
    let mx = -1, my = -1, hovIdx = -1

    function readAccent() {
      const v = getComputedStyle(document.documentElement).getPropertyValue("--tm-accent").trim()
      accentRgb = hexToRgb(v)
    }
    readAccent()

    const ns: PhysNode[] = topology.nodes.map((n, i) => ({
      ...n, x: 0, y: 0,
      vx: (Math.random() - 0.5) * 3,
      vy: (Math.random() - 0.5) * 3,
    }))
    const edges = topology.edges

    function scatter() {
      ns.forEach((n, i) => {
        const angle = (i / Math.max(ns.length, 1)) * Math.PI * 2 + (Math.random() - 0.5) * 1.2
        const rad = 30 + Math.random() * Math.min(W, H) * 0.25
        n.x = W / 2 + Math.cos(angle) * rad
        n.y = H / 2 + Math.sin(angle) * rad
        n.vx = (Math.random() - 0.5) * 4
        n.vy = (Math.random() - 0.5) * 4
      })
    }

    function resize() {
      const rect = wrap!.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = rect.width || 800
      H = rect.height || 560
      canvas!.width = W * dpr
      canvas!.height = H * dpr
      canvas!.style.width = `${W}px`
      canvas!.style.height = `${H}px`
      ctx!.scale(dpr, dpr)
      if (frame === 0) scatter()
    }
    resize()

    const ro = new ResizeObserver(() => {
      ctx!.setTransform(1, 0, 0, 1, 0, 0)
      resize()
    })
    ro.observe(wrap)

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas!.getBoundingClientRect()
      mx = e.clientX - rect.left
      my = e.clientY - rect.top
    }
    const onMouseLeave = () => { mx = -1; my = -1 }
    canvas.addEventListener("mousemove", onMouseMove)
    canvas.addEventListener("mouseleave", onMouseLeave)

    const CHARGE = 2200
    const DAMP = 0.84
    const CENTER_G = 0.005
    const SETTLE = 400

    function simulate() {
      const heat = Math.max(0.04, 1 - frame / SETTLE)

      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          let dx = ns[i].x - ns[j].x, dy = ns[i].y - ns[j].y
          let d2 = dx * dx + dy * dy
          if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1 }
          const d = Math.sqrt(d2)
          const f = (CHARGE / d2) * heat
          const nx_ = dx / d, ny_ = dy / d
          ns[i].vx += nx_ * f; ns[i].vy += ny_ * f
          ns[j].vx -= nx_ * f; ns[j].vy -= ny_ * f
        }
      }

      for (const e of edges) {
        const a = ns[e.a], b = ns[e.b]
        if (!a || !b) continue
        const dx = b.x - a.x, dy = b.y - a.y
        const d = Math.max(1, Math.sqrt(dx * dx + dy * dy))
        const stretch = d - e.restLen
        const f = stretch * e.k
        a.vx += (dx / d) * f; a.vy += (dy / d) * f
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f
      }

      for (const n of ns) {
        n.vx += (W / 2 - n.x) * CENTER_G
        n.vy += (H / 2 - n.y) * CENTER_G
        n.vx *= DAMP; n.vy *= DAMP
        n.x += n.vx; n.y += n.vy
        const mg = n.r + 18
        if (n.x < mg) { n.x = mg; n.vx *= -0.4 }
        if (n.x > W - mg) { n.x = W - mg; n.vx *= -0.4 }
        if (n.y < mg) { n.y = mg; n.vy *= -0.4 }
        if (n.y > H - mg) { n.y = H - mg; n.vy *= -0.4 }
      }
    }

    function draw() {
      ctx!.clearRect(0, 0, W, H)
      const rgb = accentRgb

      hovIdx = -1
      if (mx >= 0) {
        for (let i = 0; i < ns.length; i++) {
          const dx = mx - ns[i].x, dy = my - ns[i].y
          if (dx * dx + dy * dy < (ns[i].r + 12) ** 2) { hovIdx = i; break }
        }
      }
      canvas!.style.cursor = hovIdx >= 0 ? "pointer" : "default"

      // ── Edges ──────────────────────────────────────────────
      for (const e of edges) {
        const a = ns[e.a], b = ns[e.b]
        if (!a || !b) continue
        const isHL = hovIdx === e.a || hovIdx === e.b
        ctx!.beginPath()
        ctx!.moveTo(a.x, a.y)
        ctx!.lineTo(b.x, b.y)
        if (e.isGap) {
          ctx!.setLineDash([3, 6])
          ctx!.strokeStyle = `rgba(91,156,255,${isHL ? 0.55 : 0.1})`
        } else {
          ctx!.setLineDash([])
          ctx!.strokeStyle = `rgba(${rgb},${isHL ? 0.5 : 0.09})`
        }
        ctx!.lineWidth = isHL ? 1.3 : 0.7
        ctx!.stroke()
      }
      ctx!.setLineDash([])

      // ── Nodes ──────────────────────────────────────────────
      for (let i = 0; i < ns.length; i++) {
        const n = ns[i]
        const isHL = hovIdx === i
        // subtle pulse on owned high-level skills
        const pulse = n.isGap || n.level < 3 ? 0 : Math.sin(frame * 0.04 + i * 1.3) * 1.2

        if (n.isGap) {
          // hollow circle — skill to unlock
          ctx!.shadowBlur = isHL ? 18 : 5
          ctx!.shadowColor = `rgba(91,156,255,${isHL ? 0.7 : 0.25})`
          ctx!.beginPath()
          ctx!.arc(n.x, n.y, n.r, 0, Math.PI * 2)
          ctx!.strokeStyle = `rgba(91,156,255,${isHL ? 0.85 : 0.4})`
          ctx!.lineWidth = isHL ? 1.8 : 1.1
          ctx!.stroke()
          ctx!.shadowBlur = 0
        } else {
          // filled glowing dot — skill you have
          const op = n.hasProof ? (isHL ? 1 : 0.88) : (isHL ? 0.8 : 0.45)
          const r = n.r + (isHL ? 1.5 : pulse * 0.4)

          ctx!.shadowBlur = isHL ? 28 : n.level >= 4 ? 14 : 8
          ctx!.shadowColor = `rgba(${rgb},${isHL ? 1 : n.hasProof ? 0.6 : 0.3})`
          ctx!.beginPath()
          ctx!.arc(n.x, n.y, r, 0, Math.PI * 2)
          ctx!.fillStyle = `rgba(${rgb},${op})`
          ctx!.fill()
          ctx!.shadowBlur = 0

          if (isHL) {
            ctx!.beginPath()
            ctx!.arc(n.x, n.y, r + 5, 0, Math.PI * 2)
            ctx!.strokeStyle = `rgba(${rgb},0.25)`
            ctx!.lineWidth = 1
            ctx!.stroke()
          }
        }

        // ── Label ──────────────────────────────────────────
        if (isHL) {
          const rawLabel = n.label.length > 22 ? n.label.slice(0, 21) + "…" : n.label
          ctx!.font = `600 11px 'SF Mono', 'Fira Code', monospace`
          ctx!.textAlign = "center"
          const tw = ctx!.measureText(rawLabel).width
          const pad = 8, bh = 20
          const bx = n.x - tw / 2 - pad
          const by = n.y - n.r - bh - 8
          // pill bg
          ctx!.fillStyle = "rgba(4,8,16,0.82)"
          roundRect(ctx!, bx, by, tw + pad * 2, bh, 5)
          ctx!.fill()
          // text
          ctx!.fillStyle = n.isGap ? "rgba(91,156,255,1)" : `rgba(${rgb},1)`
          ctx!.fillText(rawLabel, n.x, by + 14)
        } else if (!n.isGap && n.level >= 4) {
          // permanent faint label for top skills
          const short = (n.label.split(" ")[0] ?? n.label).slice(0, 12)
          ctx!.font = `400 9px 'SF Mono', monospace`
          ctx!.textAlign = "center"
          ctx!.fillStyle = `rgba(${rgb},0.3)`
          ctx!.fillText(short, n.x, n.y - n.r - 4)
        }
      }
    }

    function tick() {
      animId = requestAnimationFrame(tick)
      frame++
      if (frame < SETTLE) simulate()
      draw()
    }

    tick()

    return () => {
      cancelAnimationFrame(animId)
      ro.disconnect()
      canvas.removeEventListener("mousemove", onMouseMove)
      canvas.removeEventListener("mouseleave", onMouseLeave)
    }
  }, [topology])

  return (
    <div
      ref={wrapRef}
      style={{ width: "100%", height: 560, position: "relative", overflow: "hidden" }}
    >
      <canvas ref={canvasRef} style={{ display: "block" }} />
    </div>
  )
}
