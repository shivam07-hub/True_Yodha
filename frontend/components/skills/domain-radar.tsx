"use client"

import type { UserSkillsByDomain } from "@/lib/api"

export interface DomainRadarProps {
  userSkills: UserSkillsByDomain
  onDomainClick?: (domain: string) => void
  activeDomain?: string | null
}

const RING_FRACTIONS = [0.25, 0.5, 0.75, 1.0]
const LEVEL_MAX = 5
const SVG_R = 110
const CX = 140; const CY = 140

function polarToCart(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * (Math.PI / 180)
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

// SVG-only radar — right panel is owned by the parent page
export function DomainRadar({ userSkills, onDomainClick, activeDomain }: DomainRadarProps) {
  const domains = Object.keys(userSkills.by_domain)
  const n = domains.length
  if (n === 0) return null

  const angleStep = 360 / n

  const scores = domains.map(d => {
    const items = userSkills.by_domain[d] ?? []
    if (!items.length) return 0
    return items.reduce((s, it) => s + it.level, 0) / items.length / LEVEL_MAX
  })

  const polygonPts = domains.map((_, i) => {
    const pt = polarToCart(CX, CY, SVG_R * scores[i], i * angleStep)
    return `${pt.x},${pt.y}`
  }).join(" ")

  const rings = RING_FRACTIONS.map(frac =>
    domains.map((_, i) => {
      const pt = polarToCart(CX, CY, SVG_R * frac, i * angleStep)
      return `${pt.x},${pt.y}`
    }).join(" ")
  )

  return (
    <svg width={280} height={280} viewBox="0 0 280 280" style={{ flexShrink: 0 }}>
      <defs>
        <filter id="radarGlow">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Grid rings */}
      {rings.map((pts, i) => (
        <polygon key={i} points={pts} fill="none"
          stroke="var(--tm-border)" strokeWidth="1" opacity={0.5 + i * 0.15}
        />
      ))}

      {/* Spokes — active spoke brightens */}
      {domains.map((domain, i) => {
        const outer = polarToCart(CX, CY, SVG_R, i * angleStep)
        const isActive = activeDomain === domain
        return (
          <line key={i} x1={CX} y1={CY} x2={outer.x} y2={outer.y}
            stroke={isActive ? "var(--tm-accent)" : "var(--tm-border)"}
            strokeWidth={isActive ? "1.5" : "1"}
            opacity={activeDomain && !isActive ? 0.25 : 0.6}
            style={{ transition: "opacity 250ms, stroke 250ms" }}
          />
        )
      })}

      {/* Data polygon */}
      <polygon points={polygonPts}
        fill="var(--tm-accent)" fillOpacity="0.12"
        stroke="var(--tm-accent)" strokeWidth="2"
        filter="url(#radarGlow)"
        style={{ transition: "all 400ms var(--tm-ease)" }}
      />

      {/* Data points — inactive dims when a domain is selected */}
      {domains.map((domain, i) => {
        const pt = polarToCart(CX, CY, SVG_R * scores[i], i * angleStep)
        const isActive = activeDomain === domain
        return (
          <g key={domain} onClick={() => onDomainClick?.(domain)} style={{ cursor: "pointer" }}>
            <circle cx={pt.x} cy={pt.y} r={isActive ? 7 : 4}
              fill="var(--tm-accent)"
              opacity={activeDomain && !isActive ? 0.3 : 1}
              filter={isActive ? "url(#radarGlow)" : undefined}
              style={{ transition: "r 200ms, opacity 250ms" }}
            />
          </g>
        )
      })}

      {/* Labels — first word shown, full name in <title> tooltip */}
      {domains.map((domain, i) => {
        const labelR = SVG_R + 22
        const pt = polarToCart(CX, CY, labelR, i * angleStep)
        const isActive = activeDomain === domain
        const firstWord = domain.split(" ")[0]
        return (
          <text key={domain} x={pt.x} y={pt.y + 4}
            textAnchor="middle" fontSize="9"
            fill={isActive ? "var(--tm-accent)" : activeDomain ? "var(--tm-text-faint)" : "var(--tm-text-faint)"}
            fontFamily="inherit"
            opacity={activeDomain && !isActive ? 0.4 : 1}
            onClick={() => onDomainClick?.(domain)}
            style={{ cursor: "pointer", userSelect: "none", transition: "opacity 250ms" }}
          >
            <title>{domain}</title>
            {firstWord}
          </text>
        )
      })}
    </svg>
  )
}
