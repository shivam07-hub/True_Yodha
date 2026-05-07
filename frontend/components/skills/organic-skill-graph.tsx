"use client"

import { useMemo, useState } from "react"
import type { GapSkill, UserSkillsByDomain, UserSkillItem } from "@/lib/api"

interface SkillNode {
  id: string
  label: string
  level: number
  type: "root" | "l1" | "l2" | "l3" | "gap" | "ghost"
  x: number
  y: number
  r: number
  domain: string
  cluster: string
  hasProof: boolean
  item?: UserSkillItem
  gap?: GapSkill
}

interface Edge {
  from: string
  to: string
  type: "tree" | "cv-ref" | "derived" | "unlock"
}

interface OrganicSkillGraphProps {
  userSkills: UserSkillsByDomain
  gapSkills?: GapSkill[]
  width?: number
  height?: number
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function jitter(seed: string, range: number, offset = 0): number {
  return (hashStr(seed + offset) % (range * 2)) - range
}

function compactLabel(label: string, max = 14): string {
  if (!label) return ""
  if (label.length <= max) return label
  const first = label.split(" ")[0] ?? label
  if (first.length <= max) return first
  return `${first.slice(0, max - 1)}…`
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()
}

function findBestUnlockAnchor(gapSkill: string, skillNodes: SkillNode[]): SkillNode | null {
  if (skillNodes.length === 0) return null

  const gapTokens = new Set(normalizeText(gapSkill).split(" ").filter(Boolean))
  let best: SkillNode | null = null
  let bestScore = -1

  for (const node of skillNodes) {
    const nodeTokens = normalizeText(node.label).split(" ").filter(Boolean)
    let score = 0
    for (const token of nodeTokens) {
      if (gapTokens.has(token)) score += 2
    }

    // Prefer higher-confidence source skills as learning anchors.
    if (node.hasProof) score += 1
    score += Math.min(node.level, 5) * 0.3

    if (score > bestScore) {
      bestScore = score
      best = node
    }
  }

  if (bestScore <= 0) {
    return skillNodes[hashStr(gapSkill) % skillNodes.length] ?? null
  }

  return best
}

function buildGraph(skills: UserSkillsByDomain, gapSkills: GapSkill[], cx: number, cy: number) {
  const nodes: SkillNode[] = []
  const edges: Edge[] = []

  nodes.push({ id: "root", label: "You", level: 5, type: "root", x: cx, y: cy, r: 24, domain: "", cluster: "", hasProof: true })

  const domains = Object.keys(skills.by_domain)
  const clusterToDomain = new Map<string, string>()

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

  const L1_R = 170

  domains.forEach((domain, i) => {
    const baseAngle = (i / Math.max(domains.length, 1)) * 2 * Math.PI - Math.PI / 2
    const angle = baseAngle + (jitter(`${domain}:a`, 15) / 180) * Math.PI
    const radius = L1_R + jitter(`${domain}:r`, 18)
    const x = cx + Math.cos(angle) * radius
    const y = cy + Math.sin(angle) * radius

    const items = skills.by_domain[domain] ?? []
    const avgLevel = items.length > 0 ? items.reduce((sum, skill) => sum + skill.level, 0) / items.length : 0

    nodes.push({
      id: `l1:${domain}`,
      label: domain,
      level: Math.round(avgLevel),
      type: "l1",
      x,
      y,
      r: 19,
      domain,
      cluster: "",
      hasProof: true,
    })
    edges.push({ from: "root", to: `l1:${domain}`, type: "tree" })

    const domainClusters = Array.from(clusterToDomain.entries())
      .filter(([, d]) => d === domain)
      .map(([cluster]) => cluster)

    domainClusters.forEach((cluster, j) => {
      const baseA2 = angle + (j - (domainClusters.length - 1) / 2) * 0.46
      const a2 = baseA2 + (jitter(`${cluster}:a2`, 11) / 180) * Math.PI
      const r2 = radius + 88 + jitter(`${cluster}:r2`, 12)
      const x2 = cx + Math.cos(a2) * r2
      const y2 = cy + Math.sin(a2) * r2

      const clusterItems = skills.by_cluster[cluster] ?? []
      const avgL2 = clusterItems.length > 0 ? clusterItems.reduce((sum, skill) => sum + skill.level, 0) / clusterItems.length : 0

      nodes.push({
        id: `l2:${cluster}`,
        label: cluster,
        level: Math.round(avgL2),
        type: "l2",
        x: x2,
        y: y2,
        r: 13,
        domain,
        cluster,
        hasProof: true,
      })
      edges.push({ from: `l1:${domain}`, to: `l2:${cluster}`, type: "tree" })

      clusterItems.forEach((item, k) => {
        const spread = Math.min(clusterItems.length, 4)
        const baseA3 = a2 + (k - (clusterItems.length - 1) / 2) * (0.38 / spread)
        const a3 = baseA3 + (jitter(`${item.key}:a3`, 8) / 180) * Math.PI
        const r3 = r2 + 74 + jitter(`${item.key}:r3`, 12)
        const x3 = cx + Math.cos(a3) * r3
        const y3 = cy + Math.sin(a3) * r3
        const nodeR = 6 + Math.min(item.level, 4) * 1.35

        nodes.push({
          id: `l3:${item.key}`,
          label: item.display_name,
          level: item.level,
          type: "l3",
          x: x3,
          y: y3,
          r: nodeR,
          domain,
          cluster,
          hasProof: !!item.evidence_text,
          item,
        })
        edges.push({ from: `l2:${cluster}`, to: `l3:${item.key}`, type: "tree" })

        if (item.evidence_text) {
          edges.push({ from: `l3:${item.key}`, to: "root", type: "cv-ref" })
        }
      })
    })
  })

  const skillNodes = nodes.filter(node => node.type === "l3")

  for (let i = 0; i < skillNodes.length; i++) {
    for (let j = i + 1; j < skillNodes.length; j++) {
      const a = skillNodes[i]
      const b = skillNodes[j]
      if (a.domain === b.domain && a.cluster !== b.cluster && hashStr(a.id + b.id) % 5 === 0) {
        edges.push({ from: a.id, to: b.id, type: "derived" })
      }
    }
  }

  const shownGapSkills = gapSkills.slice(0, 18)
  shownGapSkills.forEach((gap, index) => {
    const seed = `${gap.skill}:${index}`
    const angle = (index / Math.max(shownGapSkills.length, 1)) * 2 * Math.PI + (jitter(seed, 14) / 180) * Math.PI
    const radius = 350 + jitter(`${seed}:r`, 22)
    const x = cx + Math.cos(angle) * radius
    const y = cy + Math.sin(angle) * radius

    nodes.push({
      id: `gap:${gap.skill}:${index}`,
      label: gap.skill,
      level: gap.target_level,
      type: "gap",
      x,
      y,
      r: 9 + Math.max(1, Math.min(gap.target_level - gap.current_level, 3)),
      domain: "",
      cluster: "",
      hasProof: false,
      gap,
    })

    const anchor = findBestUnlockAnchor(gap.skill, skillNodes)
    if (anchor) {
      edges.push({ from: anchor.id, to: `gap:${gap.skill}:${index}`, type: "unlock" })
    }
  })

  if (shownGapSkills.length === 0) {
    const seeds = domains.length > 0 ? domains : ["skills"]
    const ghostCount = Math.max(10, seeds.length * 2)
    for (let i = 0; i < ghostCount; i++) {
      const seed = `${seeds[i % seeds.length]}:${i}`
      const angle = (i / ghostCount) * 2 * Math.PI + (jitter(seed, 12) / 180) * Math.PI
      const radius = 350 + jitter(`${seed}:ghost`, 20)
      nodes.push({
        id: `ghost:${i}`,
        label: "",
        level: 0,
        type: "ghost",
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        r: 8 + Math.abs(jitter(`${seed}:s`, 3)),
        domain: "",
        cluster: "",
        hasProof: false,
      })
    }
  }

  return { nodes, edges }
}

export function OrganicSkillGraph({ userSkills, gapSkills = [], width = 1480, height = 760 }: OrganicSkillGraphProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  const cx = width / 2
  const cy = height / 2

  const { nodes, edges } = useMemo(() => buildGraph(userSkills, gapSkills, cx, cy), [userSkills, gapSkills, cx, cy])
  const nodeMap = useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes])

  const palette = {
    fillCore: "#040810",
    l1Stroke: "var(--tm-accent)",
    l2Stroke: "#00D8C4",
    unlockStroke: "#5B9CFF",
    treeEdge: "rgba(123,130,144,0.28)",
    treeBackbone: "rgba(123,130,144,0.42)",
  }

  return (
    <div style={{ position: "relative", width: "100%", height }}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
        {edges.filter(edge => edge.type === "tree").map(edge => {
          const from = nodeMap.get(edge.from)
          const to = nodeMap.get(edge.to)
          if (!from || !to) return null

          const isHL = hovered === edge.from || hovered === edge.to
          const isBackbone = from.type === "root" || from.type === "l1" || to.type === "l1"

          return (
            <line
              key={`${edge.from}-${edge.to}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={isHL ? "var(--tm-accent)" : isBackbone ? palette.treeBackbone : palette.treeEdge}
              strokeWidth={isHL ? 1.6 : isBackbone ? 1.2 : 1}
              style={{ transition: "stroke 200ms, stroke-width 200ms" }}
            />
          )
        })}

        {edges.filter(edge => edge.type === "unlock").map(edge => {
          const from = nodeMap.get(edge.from)
          const to = nodeMap.get(edge.to)
          if (!from || !to) return null

          const isHL = hovered === edge.from || hovered === edge.to

          return (
            <line
              key={`unlock-${edge.from}-${edge.to}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="rgba(91,156,255,0.62)"
              strokeDasharray="4 4"
              strokeWidth={isHL ? 1.5 : 1.05}
              opacity={isHL ? 0.95 : 0.7}
            />
          )
        })}

        {edges.filter(edge => edge.type === "cv-ref").map(edge => {
          const from = nodeMap.get(edge.from)
          const to = nodeMap.get(edge.to)
          if (!from || !to || hovered !== edge.from) return null

          return (
            <line
              key={`cvref-${edge.from}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="var(--tm-accent)"
              strokeWidth="1"
              strokeDasharray="5 5"
              opacity="0.55"
            />
          )
        })}

        {edges.filter(edge => edge.type === "derived").map(edge => {
          const from = nodeMap.get(edge.from)
          const to = nodeMap.get(edge.to)
          if (!from || !to) return null

          const isHL = hovered === edge.from || hovered === edge.to
          if (!isHL) return null

          return (
            <line
              key={`derived-${edge.from}-${edge.to}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="rgba(145,153,168,0.7)"
              strokeWidth="1.05"
              strokeDasharray="4 4"
              opacity="0.7"
            />
          )
        })}

        {nodes.map(node => {
          const isHL = hovered === node.id
          const isRoot = node.type === "root"
          const isL1 = node.type === "l1"
          const isL2 = node.type === "l2"
          const isGap = node.type === "gap"
          const isGhost = node.type === "ghost"
          const isLocked = node.type === "l3" && !node.hasProof

          const stroke = isRoot || isL1
            ? palette.l1Stroke
            : isL2 || node.type === "l3"
              ? isLocked ? palette.unlockStroke : palette.l2Stroke
              : palette.unlockStroke

          const fill = isGap || isGhost || isLocked ? "transparent" : palette.fillCore

          return (
            <g
              key={node.id}
              onMouseEnter={() => setHovered(node.id)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: isGhost ? "default" : "pointer" }}
            >
              <title>
                {node.type === "gap" && node.gap
                  ? `${node.gap.skill} · L${node.gap.current_level} → L${node.gap.target_level} · ${node.gap.why_it_matters}`
                  : node.type === "l3" && node.item
                    ? `${node.item.display_name} · ${node.item.proficiency_title}`
                    : node.label}
              </title>

              <circle
                cx={node.x}
                cy={node.y}
                r={node.r}
                fill={fill}
                stroke={stroke}
                strokeWidth={isHL ? 2.25 : isRoot || isL1 ? 2 : 1.8}
                opacity={isGhost ? 0.85 : 1}
                style={{ transition: "stroke-width 200ms" }}
              />

              {(isL1 || isL2 || isGap || (node.type === "l3" && (isHL || node.level >= 3))) && (
                <text
                  x={node.x}
                  y={node.y + node.r + 12}
                  textAnchor="middle"
                  fontSize={isL1 ? 11 : 10}
                  fill={isHL ? "var(--tm-text)" : "var(--tm-text-muted)"}
                  fontFamily="inherit"
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {compactLabel(node.label)}
                </text>
              )}

              {isRoot && (
                <>
                  <text
                    x={node.x}
                    y={node.y + 4}
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--tm-accent-fg)"
                    fontWeight="700"
                    fontFamily="inherit"
                    style={{ pointerEvents: "none" }}
                  >
                    YOU
                  </text>
                  <text
                    x={node.x}
                    y={node.y + node.r + 16}
                    textAnchor="middle"
                    fontSize="11"
                    fill="var(--tm-text-muted)"
                    fontFamily="inherit"
                    style={{ pointerEvents: "none" }}
                  >
                    You
                  </text>
                </>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
