"use client"

import {
  RADAR_CX,
  RADAR_CY,
  RADAR_R,
  RADAR_SVG_SIZE,
  pointsToPolygonAttr,
  radarShape,
} from "@/lib/radar-geometry"

export interface DomainRadarProps {
  /** Persisted domain scores from the canonical scoring engine (0–100). */
  domainScores: Record<string, number>
  onDomainClick?: (domain: string) => void
  activeDomain?: string | null
}

// SVG-only radar — right panel is owned by the parent page
export function DomainRadar({ domainScores, onDomainClick, activeDomain }: DomainRadarProps) {
  const domains = Object.keys(domainScores)
  if (domains.length === 0) return null

  const scoresByDomain: Record<string, number> = {}
  for (const d of domains) {
    scoresByDomain[d] = Math.min(1, Math.max(0, (domainScores[d] ?? 0) / 100))
  }

  const { spokes, rings, polygon, labels } = radarShape(domains, scoresByDomain)
  const polygonPts = pointsToPolygonAttr(polygon)

  // Labels are placed at RADAR_R + 22 from center and middle-anchored, so the
  // side labels (e.g. "Business" right, "Sales" left) extend past the 280-unit
  // box and get clipped by the SVG viewport. Reserve a gutter on every side so
  // label text has bleed room. The geometry constants stay shared/untouched —
  // only this component's viewport grows; CSS scales the SVG to fit either way.
  const LABEL_GUTTER = 20
  const vbSize = RADAR_SVG_SIZE + LABEL_GUTTER * 2

  return (
    <svg
      width={RADAR_SVG_SIZE}
      height={RADAR_SVG_SIZE}
      viewBox={`${-LABEL_GUTTER} ${-LABEL_GUTTER} ${vbSize} ${vbSize}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ flexShrink: 0 }}
    >
      <defs>
        <filter id="radarGlow">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Grid rings */}
      {rings.map((pts, i) => (
        <polygon key={i} points={pointsToPolygonAttr(pts)} fill="none"
          stroke="var(--tm-border)" strokeWidth="1" opacity={0.5 + i * 0.15}
        />
      ))}

      {/* Spokes — active spoke brightens */}
      {domains.map((domain, i) => {
        const outer = spokes[i]
        const isActive = activeDomain === domain
        return (
          <line key={i} x1={RADAR_CX} y1={RADAR_CY} x2={outer.x} y2={outer.y}
            stroke={isActive ? "var(--data-1)" : "var(--tm-border)"}
            strokeWidth={isActive ? "1.5" : "1"}
            opacity={activeDomain && !isActive ? 0.25 : 0.6}
            style={{ transition: "opacity 250ms, stroke 250ms" }}
          />
        )
      })}

      {/* Data polygon */}
      <polygon points={polygonPts}
        fill="var(--data-1)" fillOpacity="0.12"
        stroke="var(--data-1)" strokeWidth="2"
        filter="url(#radarGlow)"
        style={{ transition: "all 400ms var(--tm-ease)" }}
      />

      {/* Data points — inactive dims when a domain is selected */}
      {domains.map((domain, i) => {
        const pt = polygon[i]
        const isActive = activeDomain === domain
        return (
          <g key={domain} onClick={() => onDomainClick?.(domain)} style={{ cursor: onDomainClick ? "pointer" : "default" }}>
            <circle cx={pt.x} cy={pt.y} r={isActive ? 7 : 4}
              fill="var(--data-1)"
              opacity={activeDomain && !isActive ? 0.3 : 1}
              filter={isActive ? "url(#radarGlow)" : undefined}
              style={{ transition: "r 200ms, opacity 250ms" }}
            />
          </g>
        )
      })}

      {/* Labels — first word shown, full name in <title> tooltip */}
      {labels.map(({ x, y, domain, firstWord }) => {
        const isActive = activeDomain === domain
        return (
          <text key={domain} x={x} y={y + 4}
            textAnchor="middle" fontSize="9"
            fill={isActive ? "var(--data-1)" : "var(--tm-text-faint)"}
            fontFamily="inherit"
            opacity={activeDomain && !isActive ? 0.4 : 1}
            onClick={() => onDomainClick?.(domain)}
            style={{ cursor: onDomainClick ? "pointer" : "default", userSelect: "none", transition: "opacity 250ms" }}
          >
            <title>{domain}</title>
            {firstWord}
          </text>
        )
      })}
      {/* Anchor RADAR_R import so unused-warning lint pass stays happy when future
          tweaks drop the constant; keeps the math centralized in radar-geometry. */}
      <desc>{`radius=${RADAR_R}`}</desc>
    </svg>
  )
}
