"use client"

import { useMemo, useState } from "react"
import type { UserSkillsByDomain, UserSkillItem } from "@/lib/api"

// ── Types ─────────────────────────────────────────────────────────────────────

interface SkillNode {
  id: string
  label: string
  level: number
  type: "root" | "l1" | "l2" | "l3"
  x: number
  y: number
  r: number
  domain: string
  cluster: string
  hasProof: boolean
  item?: UserSkillItem
}

interface Edge {
  from: string; to: string; type: "tree" | "cv-ref" | "derived"
}

interface OrganicSkillGraphProps {
  userSkills: UserSkillsByDomain
  width?: number
  height?: number
}

// ── Deterministic jitter from string ─────────────────────────────────────────

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function jitter(seed: string, range: number, offset = 0): number {
  return ((hashStr(seed + offset) % (range * 2)) - range)
}

// ── Build node graph from API data ────────────────────────────────────────────

function buildGraph(skills: UserSkillsByDomain, cx: number, cy: number) {
  const nodes: SkillNode[] = []
  const edges: Edge[] = []

  // Root
  nodes.push({ id: "root", label: "You", level: 5, type: "root", x: cx, y: cy, r: 20, domain: "", cluster: "", hasProof: true })

  const domains = Object.keys(skills.by_domain)
  const clusterToDomain = new Map<string, string>()

  // Map clusters to domains via skill membership
  for (const [domain, items] of Object.entries(skills.by_domain)) {
    for (const item of items) {
      for (const [cluster, cItems] of Object.entries(skills.by_cluster)) {
        if (cItems.some(c => c.key === item.key)) {
          clusterToDomain.set(cluster, domain)
          break
        }
      }
    }
  }

  // L1 — domains in imperfect circle around center
  const L1_R = 140
  domains.forEach((domain, i) => {
    const baseAngle = (i / domains.length) * 2 * Math.PI - Math.PI / 2
    const angleJitter = (jitter(domain, 18) / 180) * Math.PI
    const rJitter = jitter(domain + "r", 18)
    const angle = baseAngle + angleJitter
    const r = L1_R + rJitter
    const x = cx + Math.cos(angle) * r
    const y = cy + Math.sin(angle) * r
    const items = skills.by_domain[domain] ?? []
    const avgLevel = items.length > 0 ? items.reduce((s, it) => s + it.level, 0) / items.length : 0

    nodes.push({ id: `l1:${domain}`, label: domain.split(" ")[0], level: Math.round(avgLevel), type: "l1", x, y, r: 16, domain, cluster: "", hasProof: true })
    edges.push({ from: "root", to: `l1:${domain}`, type: "tree" })

    // L2 — clusters belonging to this domain
    const domainClusters = Array.from(clusterToDomain.entries())
      .filter(([, d]) => d === domain)
      .map(([c]) => c)

    domainClusters.forEach((cluster, j) => {
      const baseA2 = angle + (j - (domainClusters.length - 1) / 2) * 0.55
      const a2Jitter = (jitter(cluster, 12) / 180) * Math.PI
      const a2 = baseA2 + a2Jitter
      const r2 = r + 80 + jitter(cluster + "r", 12)
      const x2 = cx + Math.cos(a2) * r2
      const y2 = cy + Math.sin(a2) * r2
      const cItems = skills.by_cluster[cluster] ?? []
      const avgL2 = cItems.length > 0 ? cItems.reduce((s, it) => s + it.level, 0) / cItems.length : 0

      nodes.push({ id: `l2:${cluster}`, label: cluster.split(" ")[0], level: Math.round(avgL2), type: "l2", x: x2, y: y2, r: 11, domain, cluster, hasProof: true })
      edges.push({ from: `l1:${domain}`, to: `l2:${cluster}`, type: "tree" })

      // L3 — individual skills
      cItems.forEach((item, k) => {
        const spread = Math.min(cItems.length, 4)
        const baseA3 = a2 + (k - (cItems.length - 1) / 2) * (0.45 / spread)
        const a3J = (jitter(item.key, 8) / 180) * Math.PI
        const a3 = baseA3 + a3J
        const r3 = r2 + 62 + jitter(item.key + "r", 10)
        const x3 = cx + Math.cos(a3) * r3
        const y3 = cy + Math.sin(a3) * r3
        const nodeR = 5 + Math.min(item.level, 4) * 1.2

        nodes.push({ id: `l3:${item.key}`, label: item.display_name.split(" ")[0], level: item.level, type: "l3", x: x3, y: y3, r: nodeR, domain, cluster, hasProof: !!item.evidence_text, item })
        edges.push({ from: `l2:${cluster}`, to: `l3:${item.key}`, type: "tree" })

        // CV reference edge (dashed, back toward center)
        if (item.evidence_text) {
          edges.push({ from: `l3:${item.key}`, to: "root", type: "cv-ref" })
        }
      })
    })
  })

  // Cross-connections: skills in same domain, level >= 2, different clusters
  const l3Nodes = nodes.filter(n => n.type === "l3" && n.level >= 2)
  for (let i = 0; i < l3Nodes.length; i++) {
    for (let j = i + 1; j < l3Nodes.length; j++) {
      const a = l3Nodes[i]; const b = l3Nodes[j]
      if (a.domain === b.domain && a.cluster !== b.cluster && hashStr(a.id + b.id) % 5 === 0) {
        edges.push({ from: a.id, to: b.id, type: "derived" })
      }
    }
  }

  return { nodes, edges }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OrganicSkillGraph({ userSkills, width = 900, height = 560 }: OrganicSkillGraphProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const cx = width / 2; const cy = height / 2

  const { nodes, edges } = useMemo(() => buildGraph(userSkills, cx, cy), [userSkills, cx, cy])
  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes])

  const hoveredNode = hovered ? nodeMap.get(hovered) : null

  function curvePath(from: SkillNode, to: SkillNode): string {
    const mx = (from.x + to.x) / 2 + jitter(from.id + to.id, 30)
    const my = (from.y + to.y) / 2 + jitter(to.id + from.id, 30)
    return `M${from.x},${from.y} Q${mx},${my} ${to.x},${to.y}`
  }

  const levelColors = ["#FB7185", "#F59E0B", "#60A5FA", "#4ADE80", "#00F5D4", "#A78BFA"]

  return (
    <div style={{ position: "relative", width: "100%", height }}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
        <defs>
          <radialGradient id="rootGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--tm-accent)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--tm-accent)" stopOpacity="0" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Tree edges */}
        {edges.filter(e => e.type === "tree").map(e => {
          const from = nodeMap.get(e.from); const to = nodeMap.get(e.to)
          if (!from || !to) return null
          const isHL = hovered === e.from || hovered === e.to
          return (
            <line key={`${e.from}-${e.to}`}
              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              stroke={isHL ? "var(--tm-accent)" : "rgba(255,255,255,0.08)"}
              strokeWidth={isHL ? 1.5 : 0.8}
              style={{ transition: "stroke 200ms, stroke-width 200ms" }}
            />
          )
        })}

        {/* CV reference edges (dashed, toward root) */}
        {edges.filter(e => e.type === "cv-ref").map(e => {
          const from = nodeMap.get(e.from); const to = nodeMap.get(e.to)
          if (!from || !to || hovered !== e.from) return null
          return (
            <path key={`cvref-${e.from}`} d={curvePath(from, to)}
              stroke="var(--tm-accent)" strokeWidth="1" fill="none"
              strokeDasharray="4 4" opacity="0.4"
            />
          )
        })}

        {/* Derived cross-connections */}
        {edges.filter(e => e.type === "derived").map(e => {
          const from = nodeMap.get(e.from); const to = nodeMap.get(e.to)
          if (!from || !to) return null
          const isHL = hovered === e.from || hovered === e.to
          if (!isHL) return null
          return (
            <path key={`derived-${e.from}-${e.to}`} d={curvePath(from, to)}
              stroke="var(--tm-warning)" strokeWidth="1" fill="none"
              strokeDasharray="3 3" opacity="0.5"
            />
          )
        })}

        {/* Nodes */}
        {nodes.map(n => {
          const isHL = hovered === n.id
          const color = n.type === "root" ? "var(--tm-accent)"
            : n.type === "l1" ? "var(--tm-accent)"
            : n.type === "l2" ? "rgba(0,245,212,0.7)"
            : levelColors[Math.min(n.level, 5)]

          return (
            <g key={n.id}
              onMouseEnter={() => setHovered(n.id)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "pointer" }}
            >
              {isHL && <circle cx={n.x} cy={n.y} r={n.r + 8} fill={`url(#rootGlow)`} />}
              <circle
                cx={n.x} cy={n.y} r={n.r}
                fill={`${color}18`}
                stroke={color}
                strokeWidth={isHL ? 2 : n.type === "root" ? 2 : 1}
                filter={isHL || n.type === "root" ? "url(#glow)" : undefined}
                style={{ transition: "r 200ms, stroke-width 200ms" }}
              />
              {!n.hasProof && n.type === "l3" && (
                <circle cx={n.x} cy={n.y} r={n.r} fill="none"
                  stroke={color} strokeWidth="0.8" strokeDasharray="3 2" />
              )}
              {(n.type !== "l3" || isHL) && (
                <text x={n.x} y={n.y + n.r + 11} textAnchor="middle"
                  fontSize={n.type === "root" ? 10 : n.type === "l1" ? 9 : 8}
                  fill={isHL ? "var(--tm-text)" : "var(--tm-text-faint)"}
                  fontFamily="inherit"
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {n.label}
                </text>
              )}
              {n.type === "root" && (
                <text x={n.x} y={n.y + 4} textAnchor="middle"
                  fontSize="9" fill="var(--tm-accent-fg)" fontWeight="700" fontFamily="inherit"
                  style={{ pointerEvents: "none" }}
                >
                  YOU
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {/* Hover tooltip */}
      {hoveredNode?.type === "l3" && hoveredNode.item && (
        <div style={{
          position: "absolute",
          left: Math.min(hoveredNode.x + 16, width - 200),
          top: Math.max(0, hoveredNode.y - 40),
          background: "var(--tm-surface)",
          border: "1px solid var(--tm-accent-ring)",
          borderRadius: "var(--tm-radius-sm)",
          padding: "10px 14px",
          width: 180,
          pointerEvents: "none",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          zIndex: 10,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tm-text)", marginBottom: 4 }}>
            {hoveredNode.item.display_name}
          </div>
          <div style={{ fontSize: 11, color: "var(--tm-text-muted)", marginBottom: 6 }}>
            {hoveredNode.item.proficiency_title} · L{hoveredNode.level}
          </div>
          {hoveredNode.item.evidence_text && (
            <div style={{ fontSize: 10, color: "var(--tm-text-faint)", lineHeight: 1.5, borderTop: "1px solid var(--tm-border-soft)", paddingTop: 6 }}>
              {hoveredNode.item.evidence_text.slice(0, 80)}…
            </div>
          )}
          {!hoveredNode.item.evidence_text && (
            <div style={{ fontSize: 10, color: "var(--tm-warning)", fontStyle: "italic" }}>
              No proof logged yet
            </div>
          )}
        </div>
      )}
    </div>
  )
}
