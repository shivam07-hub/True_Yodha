"use client"

import { useEffect, useState } from "react"

import {
  RADAR_CX,
  RADAR_CY,
  RADAR_R,
  RADAR_SVG_SIZE,
  normalizeDomainScoresMap,
  pointsToPolygonAttr,
  radarShape,
} from "@/lib/radar-geometry"
import { useViewport } from "@/mobile"

export interface OwnerRadarProps {
  domains: string[]
  scores: Record<string, number> | null
}

/**
 * Owner's domain radar — the ninja's full shape, drawn cold-start with a
 * stroke-dashoffset animation per SH4 motion budget (900ms).
 */
export function OwnerRadar({ domains, scores }: OwnerRadarProps) {
  const { reducedMotion } = useViewport()
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    if (reducedMotion) {
      setDrawn(true)
      return
    }
    const raf = window.requestAnimationFrame(() => setDrawn(true))
    return () => window.cancelAnimationFrame(raf)
  }, [reducedMotion])

  const normalized = normalizeDomainScoresMap(scores)
  const { spokes, rings, polygon, labels } = radarShape(domains, normalized)
  const polygonPts = pointsToPolygonAttr(polygon)

  // Approximate path perimeter for stroke-dasharray cold-draw.
  const dashLen = 2 * Math.PI * RADAR_R

  return (
    <svg
      width={RADAR_SVG_SIZE}
      height={RADAR_SVG_SIZE}
      viewBox={`0 0 ${RADAR_SVG_SIZE} ${RADAR_SVG_SIZE}`}
      role="img"
      aria-label="Domain map"
      style={{ display: "block" }}
    >
      {/* Grid rings */}
      {rings.map((pts, i) => (
        <polygon
          key={i}
          points={pointsToPolygonAttr(pts)}
          fill="none"
          stroke="var(--tm-border)"
          strokeWidth="1"
          opacity={0.4 + i * 0.12}
        />
      ))}

      {/* Spokes */}
      {spokes.map((p, i) => (
        <line
          key={i}
          x1={RADAR_CX}
          y1={RADAR_CY}
          x2={p.x}
          y2={p.y}
          stroke="var(--tm-border)"
          strokeWidth="1"
          opacity={0.45}
        />
      ))}

      {/* Data polygon */}
      <polygon
        points={polygonPts}
        fill="var(--data-1)"
        fillOpacity="0.12"
        stroke="var(--data-1)"
        strokeWidth="2"
        strokeDasharray={dashLen}
        strokeDashoffset={drawn ? 0 : dashLen}
        style={{
          transition: reducedMotion
            ? undefined
            : "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)",
        }}
      />

      {/* Vertices */}
      {polygon.map((pt, i) => (
        <circle
          key={i}
          cx={pt.x}
          cy={pt.y}
          r={4}
          fill="var(--data-1)"
          opacity={drawn ? 1 : 0}
          style={{ transition: reducedMotion ? undefined : "opacity 400ms ease 600ms" }}
        />
      ))}

      {/* Labels — first word only */}
      {labels.map(({ x, y, domain, firstWord }) => (
        <text
          key={domain}
          x={x}
          y={y + 4}
          textAnchor="middle"
          fontSize="9"
          fill="var(--tm-text-faint)"
          fontFamily="inherit"
        >
          <title>{domain}</title>
          {firstWord}
        </text>
      ))}
    </svg>
  )
}
