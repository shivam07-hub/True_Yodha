"use client"

import type { UserSkillsByDomain } from "@/lib/api"

interface DomainRadarProps {
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

export function DomainRadar({ userSkills, onDomainClick, activeDomain }: DomainRadarProps) {
  const domains = Object.keys(userSkills.by_domain)
  const n = domains.length
  if (n === 0) return null

  const angleStep = 360 / n

  // Compute average level per domain (0–1 fraction)
  const scores = domains.map(d => {
    const items = userSkills.by_domain[d] ?? []
    if (!items.length) return 0
    const avg = items.reduce((s, it) => s + it.level, 0) / items.length
    return avg / LEVEL_MAX
  })

  // Polygon points
  const polygonPts = domains.map((_, i) => {
    const pt = polarToCart(CX, CY, SVG_R * scores[i], i * angleStep)
    return `${pt.x},${pt.y}`
  }).join(" ")

  // Ring polygons
  const rings = RING_FRACTIONS.map(frac =>
    domains.map((_, i) => {
      const pt = polarToCart(CX, CY, SVG_R * frac, i * angleStep)
      return `${pt.x},${pt.y}`
    }).join(" ")
  )

  return (
    <div style={{ display: "flex", gap: 32, alignItems: "flex-start", flexWrap: "wrap" }}>
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

        {/* Spokes */}
        {domains.map((_, i) => {
          const outer = polarToCart(CX, CY, SVG_R, i * angleStep)
          return (
            <line key={i} x1={CX} y1={CY} x2={outer.x} y2={outer.y}
              stroke="var(--tm-border)" strokeWidth="1" opacity="0.5"
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

        {/* Data points */}
        {domains.map((domain, i) => {
          const pt = polarToCart(CX, CY, SVG_R * scores[i], i * angleStep)
          const isActive = activeDomain === domain
          return (
            <g key={domain} onClick={() => onDomainClick?.(domain)} style={{ cursor: "pointer" }}>
              <circle cx={pt.x} cy={pt.y} r={isActive ? 6 : 4}
                fill="var(--tm-accent)"
                filter={isActive ? "url(#radarGlow)" : undefined}
                style={{ transition: "r 200ms" }}
              />
            </g>
          )
        })}

        {/* Labels */}
        {domains.map((domain, i) => {
          const labelR = SVG_R + 22
          const pt = polarToCart(CX, CY, labelR, i * angleStep)
          const isActive = activeDomain === domain
          const shortLabel = domain.length > 10 ? domain.slice(0, 9) + "…" : domain
          return (
            <text key={domain} x={pt.x} y={pt.y + 4}
              textAnchor="middle" fontSize="9"
              fill={isActive ? "var(--tm-accent)" : "var(--tm-text-faint)"}
              fontFamily="inherit"
              onClick={() => onDomainClick?.(domain)}
              style={{ cursor: "pointer", userSelect: "none" }}
            >
              {shortLabel}
            </text>
          )
        })}
      </svg>

      {/* Domain breakdown list */}
      <div style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 4 }}>
          Domain Scores
        </div>
        {domains.map((domain, i) => {
          const pct = Math.round(scores[i] * 100)
          const isActive = activeDomain === domain
          return (
            <div key={domain}
              onClick={() => onDomainClick?.(domain)}
              style={{ cursor: "pointer" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: isActive ? "var(--tm-accent)" : "var(--tm-text-muted)", fontWeight: isActive ? 600 : 400 }}>
                  {domain}
                </span>
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  color: pct >= 70 ? "var(--tm-success)" : pct >= 40 ? "var(--tm-warning)" : "var(--tm-danger)"
                }}>
                  {pct}%
                </span>
              </div>
              <div style={{ height: 3, borderRadius: 99, background: "var(--tm-border)", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${pct}%`,
                  borderRadius: 99,
                  background: pct >= 70 ? "var(--tm-success)" : pct >= 40 ? "var(--tm-warning)" : "var(--tm-danger)",
                  transition: "width 600ms var(--tm-ease)",
                }} />
              </div>
            </div>
          )
        })}
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--tm-text-faint)", fontStyle: "italic" }}>
          Click a domain to drill into its clusters →
        </div>
      </div>
    </div>
  )
}
