"use client"

import { useMemo, useState } from "react"
import type { GapSkill, UserSkillsByDomain } from "@/lib/api"

interface SkillNodeMapProps {
  userSkills: UserSkillsByDomain
  gapSkills?: GapSkill[]
  selectedDomain?: string | null
  onDomainClick?: (domain: string) => void
}

interface LayoutNode {
  id: string
  label: string
  level: number
  domain: string
  isGap: boolean
  hasProof: boolean
  x: number
  y: number
  r: number
}

interface LayoutEdge {
  x1: number; y1: number
  x2: number; y2: number
  isGap: boolean
  domain: string | null
}

const VW = 800
const VH = 520
const CX = VW / 2
const CY = VH / 2

export function SkillNodeMap({ userSkills, gapSkills = [], selectedDomain = null, onDomainClick }: SkillNodeMapProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const { nodes, edges } = useMemo(() => {
    const domains = Object.keys(userSkills.by_domain)
    const D = domains.length
    const nodes: LayoutNode[] = []
    const edges: LayoutEdge[] = []

    // Domain cluster centers — radius scales with domain count
    const clusterR = D <= 2 ? 100 : D <= 4 ? 130 : D <= 7 ? 158 : D <= 10 ? 178 : 195
    // Max spread of skills within a cluster
    const baseSpread = 54

    domains.forEach((domain, di) => {
      const sectorAngle = (di / D) * Math.PI * 2 - Math.PI / 2
      const dcx = CX + Math.cos(sectorAngle) * clusterR
      const dcy = CY + Math.sin(sectorAngle) * clusterR

      // Cap per-domain skills to avoid overcrowding
      const skills = (userSkills.by_domain[domain] ?? [])
        .slice()
        .sort((a, b) => b.level - a.level)
        .slice(0, 8)

      const spread = skills.length <= 2 ? baseSpread * 0.5 :
                     skills.length <= 4 ? baseSpread * 0.75 :
                     baseSpread

      const domainNodes: LayoutNode[] = []

      skills.forEach((skill, si) => {
        let nx: number, ny: number
        if (skills.length === 1) {
          nx = dcx; ny = dcy
        } else {
          const spreadAngle = (si / skills.length) * Math.PI * 2 + sectorAngle + 0.4
          const sr = spread * (si % 2 === 0 ? 0.55 : 1.0)
          nx = dcx + Math.cos(spreadAngle) * sr
          ny = dcy + Math.sin(spreadAngle) * sr
        }

        const node: LayoutNode = {
          id: `skill:${skill.key}`,
          label: skill.display_name,
          level: skill.level,
          domain,
          isGap: false,
          hasProof: !!skill.evidence_text,
          x: Math.max(28, Math.min(VW - 28, nx)),
          y: Math.max(18, Math.min(VH - 18, ny)),
          r: 4.5 + Math.min(skill.level, 5) * 2,
        }
        nodes.push(node)
        domainNodes.push(node)
      })

      // Within-domain edges — connect most pairs, sparse for large clusters
      for (let i = 0; i < domainNodes.length; i++) {
        for (let j = i + 1; j < domainNodes.length; j++) {
          if (domainNodes.length <= 4 || (i + j) % 2 === 0) {
            edges.push({
              x1: domainNodes[i].x, y1: domainNodes[i].y,
              x2: domainNodes[j].x, y2: domainNodes[j].y,
              isGap: false, domain,
            })
          }
        }
      }
    })

    // Gap skills — outer ring, max 14
    const skillNodes = nodes.slice()
    const capped = (gapSkills ?? []).slice(0, 14)
    const GAP_R = Math.min(VW, VH) * 0.43

    capped.forEach((gap, gi) => {
      const gAngle = (gi / Math.max(capped.length, 1)) * Math.PI * 2 - Math.PI / 2
      const jitter = ((gi * 17) % 28) - 14
      const gNode: LayoutNode = {
        id: `gap:${gap.skill}`,
        label: gap.skill,
        level: gap.target_level,
        domain: "__gap__",
        isGap: true,
        hasProof: false,
        x: Math.max(28, Math.min(VW - 28, CX + Math.cos(gAngle) * (GAP_R + jitter))),
        y: Math.max(18, Math.min(VH - 18, CY + Math.sin(gAngle) * (GAP_R + jitter))),
        r: 4 + Math.min(gap.target_level, 4) * 1.5,
      }
      nodes.push(gNode)

      // Connect gap to nearest owned skill node
      let nearest: LayoutNode | null = null
      let minD = Infinity
      for (const sn of skillNodes) {
        const d = Math.hypot(sn.x - gNode.x, sn.y - gNode.y)
        if (d < minD) { minD = d; nearest = sn }
      }
      if (nearest) {
        edges.push({ x1: gNode.x, y1: gNode.y, x2: nearest.x, y2: nearest.y, isGap: true, domain: null })
      }
    })

    return { nodes, edges }
  }, [userSkills, gapSkills])

  function nodeFo(node: LayoutNode): number {
    if (!selectedDomain) return 1
    if (node.isGap) return 0.3
    return node.domain === selectedDomain ? 1 : 0.18
  }

  function edgeFo(edge: LayoutEdge): number {
    if (!selectedDomain) return 1
    if (!edge.domain) return 0.35
    return edge.domain === selectedDomain ? 1 : 0.1
  }

  const hovered = hoveredId ? nodes.find(n => n.id === hoveredId) ?? null : null

  return (
    <div style={{ width: "100%", height: 520, position: "relative" }}>
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: "100%", height: "100%", display: "block" }}
        aria-label="Skill intelligence node map"
      >
        {/* Edges — rendered below nodes */}
        {edges.map((e, i) => (
          <line
            key={i}
            x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
            stroke={e.isGap ? "rgb(91,156,255)" : "hsl(var(--primary))"}
            strokeWidth={e.isGap ? 0.7 : 0.85}
            strokeDasharray={e.isGap ? "3 6" : undefined}
            opacity={0.22 * edgeFo(e)}
          />
        ))}

        {/* Nodes */}
        {nodes.map(node => {
          const isHov = hoveredId === node.id
          const fo = nodeFo(node)
          const isClickable = !node.isGap && !!onDomainClick

          return (
            <g
              key={node.id}
              onMouseEnter={() => setHoveredId(node.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => isClickable && onDomainClick!(node.domain)}
              style={{ cursor: isClickable ? "pointer" : "default" }}
            >
              {/* Glow halo on owned skills */}
              {!node.isGap && (
                <circle
                  cx={node.x} cy={node.y}
                  r={node.r + (isHov ? 11 : 5)}
                  fill="hsl(var(--primary))"
                  opacity={(isHov ? 0.22 : 0.07) * fo}
                />
              )}

              {/* Main circle */}
              {node.isGap ? (
                <circle
                  cx={node.x} cy={node.y} r={node.r}
                  fill="none"
                  stroke="rgb(91,156,255)"
                  strokeWidth={isHov ? 1.7 : 1.1}
                  opacity={(isHov ? 0.9 : 0.45) * fo}
                />
              ) : (
                <circle
                  cx={node.x} cy={node.y}
                  r={node.r + (isHov ? 1.5 : 0)}
                  fill="hsl(var(--primary))"
                  opacity={(node.hasProof ? (isHov ? 1 : 0.88) : (isHov ? 0.78 : 0.48)) * fo}
                />
              )}

              {/* Permanent label for higher-level owned skills */}
              {!isHov && !node.isGap && node.level >= 3 && (
                <text
                  x={node.x}
                  y={node.y + node.r + 11}
                  textAnchor="middle"
                  fontSize="8.5"
                  fontFamily="'SF Mono', 'Fira Code', monospace"
                  fill="hsl(var(--foreground))"
                  opacity={0.38 * fo}
                  pointerEvents="none"
                >
                  {(node.label.split(" ")[0] ?? node.label).slice(0, 12)}
                </text>
              )}
            </g>
          )
        })}

        {/* Hover tooltip — SVG native, always on top */}
        {hovered && (() => {
          const n = hovered
          const label = n.label.length > 22 ? n.label.slice(0, 21) + "…" : n.label
          const sub = n.isGap
            ? `L${n.level} target · gap`
            : `L${n.level} · ${n.domain}${n.hasProof ? " · proven" : ""}`
          const tw = Math.max(label.length, sub.length) * 6.1 + 24
          const th = 38
          const tx = Math.max(4, Math.min(VW - tw - 4, n.x - tw / 2))
          const ty = Math.max(4, n.y - n.r - th - 10)

          return (
            <g pointerEvents="none">
              <rect
                x={tx} y={ty} width={tw} height={th}
                rx="5"
                fill="rgba(4,8,16,0.88)"
                stroke="rgba(255,255,255,0.09)"
                strokeWidth="0.8"
              />
              <text
                x={tx + tw / 2} y={ty + 14}
                textAnchor="middle" fontSize="10.5" fontWeight="600"
                fontFamily="'SF Mono', monospace"
                fill={n.isGap ? "rgb(91,156,255)" : "hsl(var(--primary))"}
              >{label}</text>
              <text
                x={tx + tw / 2} y={ty + 28}
                textAnchor="middle" fontSize="9"
                fontFamily="'SF Mono', monospace"
                fill="rgba(255,255,255,0.42)"
              >{sub}</text>
            </g>
          )
        })()}
      </svg>

      {/* Legend */}
      <div style={{
        position: "absolute", bottom: 12, right: 16,
        display: "flex", gap: 14, alignItems: "center",
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--tm-text-faint)" }}>
          <svg width="10" height="10" aria-hidden="true">
            <circle cx="5" cy="5" r="4" fill="hsl(var(--primary))" opacity="0.85" />
          </svg>
          Skills you have
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--tm-text-faint)" }}>
          <svg width="10" height="10" aria-hidden="true">
            <circle cx="5" cy="5" r="4" fill="none" stroke="rgb(91,156,255)" strokeWidth="1.2" opacity="0.65" />
          </svg>
          Skills to unlock
        </span>
      </div>
    </div>
  )
}
