"use client"

import type { KeyboardEvent } from "react"

import {
  RADAR_CX,
  RADAR_CY,
  RADAR_R,
  RADAR_SVG_SIZE,
  pointsToPolygonAttr,
  polarToCart,
  radarShape,
} from "@/lib/radar-geometry"

export interface DomainRadarProps {
  /** Persisted domain scores from the canonical scoring engine (0–100). */
  domainScores: Record<string, number>
  onDomainClick?: (domain: string) => void
  activeDomain?: string | null
}

function activateDomainKey(
  e: KeyboardEvent<SVGGElement>,
  domain: string,
  onDomainClick?: (domain: string) => void,
) {
  if (!onDomainClick) return
  if (e.key !== "Enter" && e.key !== " ") return
  e.preventDefault()
  onDomainClick(domain)
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
  const n = domains.length
  const angleStep = n > 0 ? 360 / n : 0
  const pickable = Boolean(onDomainClick)

  // Labels sit at RADAR_R + 22, middle-anchored. 11px names need more bleed
  // than the old 9px faint glyphs — grow the viewport, not the polar math.
  const LABEL_GUTTER = 36
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

      {rings.map((pts, i) => (
        <polygon key={i} points={pointsToPolygonAttr(pts)} fill="none"
          stroke="var(--tm-border)" strokeWidth="1" opacity={0.45 + i * 0.12}
          pointerEvents="none"
        />
      ))}

      {domains.map((domain, i) => {
        const outer = spokes[i]
        const isActive = activeDomain === domain
        return (
          <line key={`spoke-${domain}`} x1={RADAR_CX} y1={RADAR_CY} x2={outer.x} y2={outer.y}
            stroke={isActive ? "var(--data-1)" : "var(--tm-border)"}
            strokeWidth={isActive ? "1.5" : "1"}
            opacity={isActive ? 1 : 0.55}
            pointerEvents="none"
          />
        )
      })}

      <polygon points={polygonPts}
        fill="var(--data-1)" fillOpacity="0.12"
        stroke="var(--data-1)" strokeWidth="2"
        filter="url(#radarGlow)"
        pointerEvents="none"
      />

      {domains.map((domain, i) => {
        const pt = polygon[i]
        const label = labels[i]
        const isActive = activeDomain === domain
        const padInner = polarToCart(RADAR_CX, RADAR_CY, RADAR_R * 0.62, i * angleStep)
        return (
          <g
            key={domain}
            className="dr-hit"
            role={pickable ? "button" : undefined}
            tabIndex={pickable ? 0 : undefined}
            aria-label={pickable ? domain : undefined}
            aria-pressed={pickable ? isActive : undefined}
            data-active={isActive ? "true" : undefined}
            onClick={pickable ? () => onDomainClick?.(domain) : undefined}
            onKeyDown={pickable ? (e) => activateDomainKey(e, domain, onDomainClick) : undefined}
            style={{ cursor: pickable ? "pointer" : "default" }}
          >
            <title>{domain}</title>
            <line className="dr-hit-pad" x1={padInner.x} y1={padInner.y} x2={label.x} y2={label.y}
              stroke="transparent" strokeWidth="28" />
            <circle className="dr-hit-pad" cx={label.x} cy={label.y} r="18" fill="transparent" />
            <circle className="dr-focus-ring" cx={label.x} cy={label.y} r="16" fill="none" stroke="transparent" strokeWidth="2" />
            <circle className="dr-hover-ring" cx={label.x} cy={label.y} r="16" fill="none" stroke="transparent" strokeWidth="1" />
            <circle
              className="dr-vertex"
              cx={pt.x} cy={pt.y} r="4"
              fill="var(--data-1)"
              opacity={activeDomain && !isActive ? 0.55 : 1}
              filter={isActive ? "url(#radarGlow)" : undefined}
            />
            <text
              className="dr-label"
              x={label.x} y={label.y + 4}
              textAnchor="middle"
              fontSize="11"
              fontWeight={isActive ? 650 : 600}
              fill={isActive ? "var(--data-1)" : "var(--tm-text)"}
              fontFamily="var(--tm-font-sans)"
              style={{ userSelect: "none" }}
            >
              {label.firstWord}
            </text>
          </g>
        )
      })}
      <desc>{`radius=${RADAR_R}`}</desc>
    </svg>
  )
}
