"use client"

import { useEffect, useRef, useMemo } from "react"
import type { GapSkill, UserSkillsByDomain } from "@/lib/api"

interface SkillNodeMapProps {
  userSkills: UserSkillsByDomain
  gapSkills?: GapSkill[]
  selectedDomain?: string | null
  onDomainClick?: (domain: string) => void
}

interface CNode {
  id: string; label: string; level: number; domain: string
  isGap: boolean; hasProof: boolean
  x: number; y: number; vx: number; vy: number; r: number
}
interface CEdge { a: number; b: number; isGap: boolean; domain: string | null }

function hexToRgb(hex: string): string {
  const h = hex.trim()
  if (h.startsWith("#") && h.length === 7)
    return `${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}`
  return "79,199,246"
}

const VW = 800, VH = 520

function buildLayout(userSkills: UserSkillsByDomain, gapSkills: GapSkill[]): { nodes: CNode[]; edges: CEdge[] } {
  const CX = VW / 2, CY = VH / 2
  const domains = Object.keys(userSkills.by_domain)
  const D = domains.length
  const nodes: CNode[] = []
  const edges: CEdge[] = []
  const clusterR = D <= 2 ? 100 : D <= 4 ? 130 : D <= 7 ? 158 : D <= 10 ? 178 : 195

  domains.forEach((domain, di) => {
    const sa = (di / D) * Math.PI * 2 - Math.PI / 2
    const dcx = CX + Math.cos(sa) * clusterR
    const dcy = CY + Math.sin(sa) * clusterR
    const skills = (userSkills.by_domain[domain] ?? []).slice().sort((a, b) => b.level - a.level).slice(0, 8)
    const spread = skills.length <= 2 ? 27 : skills.length <= 4 ? 40 : 54
    const start = nodes.length

    skills.forEach((skill, si) => {
      let nx = dcx, ny = dcy
      if (skills.length > 1) {
        const a = (si / skills.length) * Math.PI * 2 + sa + 0.4
        const sr = spread * (si % 2 === 0 ? 0.55 : 1.0)
        nx = dcx + Math.cos(a) * sr; ny = dcy + Math.sin(a) * sr
      }
      nodes.push({
        id: `skill:${skill.key}`, label: skill.display_name, level: skill.level,
        domain, isGap: false, hasProof: !!skill.evidence_text,
        x: Math.max(28, Math.min(VW - 28, nx)), y: Math.max(18, Math.min(VH - 18, ny)),
        vx: 0, vy: 0, r: 4.5 + Math.min(skill.level, 5) * 2,
      })
    })
    const idxs = Array.from({ length: nodes.length - start }, (_, i) => start + i)
    for (let i = 0; i < idxs.length; i++)
      for (let j = i + 1; j < idxs.length; j++)
        if (idxs.length <= 4 || (i + j) % 2 === 0)
          edges.push({ a: idxs[i], b: idxs[j], isGap: false, domain })
  })

  const skillNodes = nodes.slice()
  const GAP_R = Math.min(VW, VH) * 0.43
  gapSkills.slice(0, 14).forEach((gap, gi) => {
    const ga = (gi / Math.max(gapSkills.length, 1)) * Math.PI * 2 - Math.PI / 2
    const jitter = ((gi * 17) % 28) - 14
    const gIdx = nodes.length
    nodes.push({
      id: `gap:${gap.skill}`, label: gap.skill, level: gap.target_level,
      domain: "__gap__", isGap: true, hasProof: false,
      x: Math.max(28, Math.min(VW - 28, VW / 2 + Math.cos(ga) * (GAP_R + jitter))),
      y: Math.max(18, Math.min(VH - 18, VH / 2 + Math.sin(ga) * (GAP_R + jitter))),
      vx: 0, vy: 0, r: 4 + Math.min(gap.target_level, 4) * 1.5,
    })
    let nearest = -1, minD = Infinity
    skillNodes.forEach((sn, si) => {
      const d = Math.hypot(sn.x - nodes[gIdx].x, sn.y - nodes[gIdx].y)
      if (d < minD) { minD = d; nearest = si }
    })
    if (nearest >= 0) edges.push({ a: gIdx, b: nearest, isGap: true, domain: null })
  })
  return { nodes, edges }
}

export function SkillNodeMap({ userSkills, gapSkills = [], selectedDomain = null, onDomainClick }: SkillNodeMapProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nodesRef = useRef<CNode[]>([])
  const edgesRef = useRef<CEdge[]>([])
  const selectedDomainRef = useRef(selectedDomain)
  const onClickRef = useRef(onDomainClick)
  const drawRef = useRef<(() => void) | null>(null)

  const layout = useMemo(() => buildLayout(userSkills, gapSkills), [userSkills, gapSkills])

  useEffect(() => {
    nodesRef.current = layout.nodes.map(n => ({ ...n }))
    edgesRef.current = layout.edges
    drawRef.current?.()
  }, [layout])

  useEffect(() => { selectedDomainRef.current = selectedDomain; drawRef.current?.() }, [selectedDomain])
  useEffect(() => { onClickRef.current = onDomainClick }, [onDomainClick])

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let W = 0, H = 0, dpr = 1, accentRgb = "79,199,246"
    let animId = 0, running = false
    let dragIdx = -1, hovIdx = -1, didDrag = false
    let mdPos = { x: 0, y: 0 }

    const readAccent = () => {
      accentRgb = hexToRgb(getComputedStyle(document.documentElement).getPropertyValue("--tm-interactive").trim())
    }
    readAccent()
    const mo = new MutationObserver(() => setTimeout(readAccent, 210))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-accent"] })

    const toCanvas = (x: number, y: number): [number, number] => [x * W / VW, y * H / VH]
    const toLayout = (x: number, y: number): [number, number] => [x * VW / W, y * VH / H]

    function resize() {
      const rect = wrap!.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = rect.width || VW; H = rect.height || VH
      canvas!.width = W * dpr; canvas!.height = H * dpr
      canvas!.style.width = `${W}px`; canvas!.style.height = `${H}px`
      ctx!.setTransform(1, 0, 0, 1, 0, 0); ctx!.scale(dpr, dpr)
      draw()
    }
    const ro = new ResizeObserver(() => { ctx!.setTransform(1, 0, 0, 1, 0, 0); resize() })
    ro.observe(wrap); resize()

    function hitTest(lx: number, ly: number, gapsToo = false): number {
      const ns = nodesRef.current
      for (let i = 0; i < ns.length; i++) {
        if (!gapsToo && ns[i].isGap) continue
        const dx = ns[i].x - lx, dy = ns[i].y - ly
        if (dx * dx + dy * dy < (ns[i].r + 8) ** 2) return i
      }
      return -1
    }

    function applySpring(di: number) {
      const ns = nodesRef.current
      const dragged = ns[di]
      for (const e of edgesRef.current) {
        const ni = e.a === di ? e.b : e.b === di ? e.a : -1
        if (ni < 0) continue
        const n = ns[ni], dx = dragged.x - n.x, dy = dragged.y - n.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const f = (dist - 85) * 0.055
        n.vx += (dx / dist) * f; n.vy += (dy / dist) * f
      }
    }

    function hasMotion() {
      return nodesRef.current.some(n => Math.abs(n.vx) > 0.02 || Math.abs(n.vy) > 0.02)
    }

    function startLoop() {
      if (running) return; running = true; tick()
    }
    function stopLoop() {
      cancelAnimationFrame(animId); animId = 0; running = false
    }

    function tick() {
      const ns = nodesRef.current
      for (let i = 0; i < ns.length; i++) {
        if (i === dragIdx) continue
        ns[i].vx *= 0.78; ns[i].vy *= 0.78
        ns[i].x = Math.max(ns[i].r + 4, Math.min(VW - ns[i].r - 4, ns[i].x + ns[i].vx))
        ns[i].y = Math.max(ns[i].r + 4, Math.min(VH - ns[i].r - 4, ns[i].y + ns[i].vy))
      }
      draw()
      if (dragIdx >= 0 || hasMotion()) { animId = requestAnimationFrame(tick) }
      else { stopLoop(); draw() }
    }

    function draw() {
      if (!ctx || !W || !H) return
      ctx.clearRect(0, 0, W, H)
      const ns = nodesRef.current, es = edgesRef.current
      const rgb = accentRgb, sel = selectedDomainRef.current
      const nFo = (n: CNode) => !sel ? 1 : n.isGap ? 0.3 : n.domain === sel ? 1 : 0.18
      const eFo = (e: CEdge) => !sel ? 1 : !e.domain ? 0.35 : e.domain === sel ? 1 : 0.1

      for (const e of es) {
        const a = ns[e.a], b = ns[e.b]; if (!a || !b) continue
        const [ax, ay] = toCanvas(a.x, a.y), [bx, by] = toCanvas(b.x, b.y)
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by)
        if (e.isGap) { ctx.setLineDash([3, 6]); ctx.strokeStyle = `rgba(91,156,255,${0.22 * eFo(e)})` }
        else { ctx.setLineDash([]); ctx.strokeStyle = `rgba(${rgb},${0.22 * eFo(e)})` }
        ctx.lineWidth = e.isGap ? 0.7 : 0.85; ctx.stroke()
      }
      ctx.setLineDash([])

      for (let i = 0; i < ns.length; i++) {
        const n = ns[i], [nx, ny] = toCanvas(n.x, n.y)
        const isH = hovIdx === i, isD = dragIdx === i
        const fo = nFo(n), nr = n.r * W / VW

        if (n.isGap) {
          ctx.shadowBlur = isH ? 14 : 4
          ctx.shadowColor = `rgba(91,156,255,${(isH ? 0.6 : 0.2) * fo})`
          ctx.beginPath(); ctx.arc(nx, ny, nr, 0, 6.283)
          ctx.strokeStyle = `rgba(91,156,255,${(isH ? 0.85 : 0.45) * fo})`
          ctx.lineWidth = isH ? 1.6 : 1.1; ctx.stroke()
        } else {
          const op = (n.hasProof ? (isD || isH ? 1 : 0.88) : (isD || isH ? 0.8 : 0.48)) * fo
          ctx.shadowBlur = isD ? 32 : isH ? 22 : n.level >= 4 ? 14 : 8
          ctx.shadowColor = `rgba(${rgb},${(isD ? 1 : isH ? 0.8 : n.hasProof ? 0.55 : 0.25) * fo})`
          ctx.beginPath(); ctx.arc(nx, ny, nr + (isD || isH ? 1.5 : 0), 0, 6.283)
          ctx.fillStyle = `rgba(${rgb},${op})`; ctx.fill()
        }
        ctx.shadowBlur = 0

        if (!n.isGap && n.level >= 3 && !isH && !isD) {
          ctx.font = `400 9px 'SF Mono', monospace`; ctx.textAlign = "center"
          ctx.fillStyle = `rgba(${rgb},${0.38 * fo})`
          ctx.fillText((n.label.split(" ")[0] ?? n.label).slice(0, 12), nx, ny + nr + 11)
        }
        if (isH || isD) {
          const lbl = n.label.length > 22 ? n.label.slice(0, 21) + "…" : n.label
          const sub = n.isGap ? `L${n.level} target · gap` : `L${n.level} · ${n.domain}${n.hasProof ? " · proven" : ""}`
          ctx.font = `600 11px 'SF Mono', monospace`
          const tw = Math.max(ctx.measureText(lbl).width, ctx.measureText(sub).width) + 20
          const th = 38, tx = Math.max(4, Math.min(W - tw - 4, nx - tw / 2))
          let ty = ny - nr - th - 10; if (ty < 4) ty = ny + nr + 10
          ctx.fillStyle = "rgba(4,8,16,0.88)"; ctx.beginPath()
          ctx.roundRect(tx, ty, tw, th, 5); ctx.fill()
          ctx.strokeStyle = "rgba(255,255,255,0.09)"; ctx.lineWidth = 0.8; ctx.stroke()
          ctx.textAlign = "center"
          ctx.font = `600 10.5px 'SF Mono', monospace`
          ctx.fillStyle = n.isGap ? "rgb(91,156,255)" : `rgba(${rgb},1)`
          ctx.fillText(lbl, tx + tw / 2, ty + 14)
          ctx.font = `400 9px 'SF Mono', monospace`
          ctx.fillStyle = "rgba(255,255,255,0.42)"; ctx.fillText(sub, tx + tw / 2, ty + 28)
        }
      }
    }

    drawRef.current = draw

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas!.getBoundingClientRect()
      const [lx, ly] = toLayout(e.clientX - rect.left, e.clientY - rect.top)
      if (dragIdx >= 0) {
        didDrag = Math.hypot(e.clientX - mdPos.x, e.clientY - mdPos.y) > 4
        const n = nodesRef.current[dragIdx]
        n.x = Math.max(n.r + 4, Math.min(VW - n.r - 4, lx))
        n.y = Math.max(n.r + 4, Math.min(VH - n.r - 4, ly))
        applySpring(dragIdx)
        if (!running) startLoop()
      } else {
        const newHov = hitTest(lx, ly, true)
        if (newHov !== hovIdx) { hovIdx = newHov; draw() }
        canvas!.style.cursor = hovIdx >= 0 && !nodesRef.current[hovIdx]?.isGap ? "grab" : "default"
      }
    }
    const onMouseDown = (e: MouseEvent) => {
      const rect = canvas!.getBoundingClientRect()
      const [lx, ly] = toLayout(e.clientX - rect.left, e.clientY - rect.top)
      const idx = hitTest(lx, ly)
      if (idx >= 0) { dragIdx = idx; didDrag = false; mdPos = { x: e.clientX, y: e.clientY }; canvas!.style.cursor = "grabbing"; startLoop() }
    }
    const onMouseUp = () => {
      if (dragIdx >= 0) {
        if (!didDrag && !nodesRef.current[dragIdx].isGap) onClickRef.current?.(nodesRef.current[dragIdx].domain)
        dragIdx = -1; canvas!.style.cursor = "default"
        if (!running && hasMotion()) startLoop()
      }
    }
    const onMouseLeave = () => { hovIdx = -1; if (dragIdx >= 0) dragIdx = -1; draw() }

    canvas.addEventListener("mousemove", onMouseMove)
    canvas.addEventListener("mousedown", onMouseDown)
    canvas.addEventListener("mouseup", onMouseUp)
    canvas.addEventListener("mouseleave", onMouseLeave)

    return () => {
      stopLoop(); ro.disconnect(); mo.disconnect()
      canvas.removeEventListener("mousemove", onMouseMove)
      canvas.removeEventListener("mousedown", onMouseDown)
      canvas.removeEventListener("mouseup", onMouseUp)
      canvas.removeEventListener("mouseleave", onMouseLeave)
    }
  }, [])

  return (
    <div ref={wrapRef} style={{ width: "100%", height: 520, position: "relative" }}>
      <canvas ref={canvasRef} style={{ display: "block" }} />
      <div style={{ position: "absolute", bottom: 12, right: 16, display: "flex", gap: 14, alignItems: "center", pointerEvents: "none" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--tm-text-faint)" }}>
          <svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="4" fill="hsl(var(--primary))" opacity="0.85" /></svg>
          Skills you have
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--tm-text-faint)" }}>
          <svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="4" fill="none" stroke="rgb(91,156,255)" strokeWidth="1.2" opacity="0.65" /></svg>
          Skills to unlock
        </span>
      </div>
    </div>
  )
}
