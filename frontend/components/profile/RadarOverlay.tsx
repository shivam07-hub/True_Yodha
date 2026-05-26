"use client"

import {
  RADAR_CX,
  RADAR_CY,
  RADAR_SVG_SIZE,
  normalizeDomainScoresMap,
  pointsToPolygonAttr,
  radarShape,
} from "@/lib/radar-geometry"

export interface RadarOverlayProps {
  domains: string[]
  ownerScores: Record<string, number> | null
  viewerScores: Record<string, number> | null
  ownerLabel?: string
  viewerLabel?: string
}

/**
 * Logged-in viewer's overlay: the ninja's polygon (accent) and the viewer's
 * polygon (warm tone) on a single grid for direct comparison.
 *
 * Used in place of GhostRadar when the viewer has their own domain map.
 */
export function RadarOverlay({
  domains,
  ownerScores,
  viewerScores,
  ownerLabel = "Owner",
  viewerLabel = "You",
}: RadarOverlayProps) {
  const ownerNorm = normalizeDomainScoresMap(ownerScores)
  const viewerNorm = normalizeDomainScoresMap(viewerScores)
  const { spokes, rings, polygon: ownerPolygon } = radarShape(domains, ownerNorm)
  const viewerPolygon = radarShape(domains, viewerNorm).polygon

  return (
    <figure style={{ margin: 0 }}>
      <svg
        width={RADAR_SVG_SIZE}
        height={RADAR_SVG_SIZE}
        viewBox={`0 0 ${RADAR_SVG_SIZE} ${RADAR_SVG_SIZE}`}
        role="img"
        aria-label={`${ownerLabel} vs ${viewerLabel} domain overlay`}
        style={{ display: "block" }}
      >
        {/* Grid */}
        {rings.map((pts, i) => (
          <polygon
            key={i}
            points={pointsToPolygonAttr(pts)}
            fill="none"
            stroke="var(--tm-border)"
            strokeWidth="1"
            opacity={0.35 + i * 0.1}
          />
        ))}
        {spokes.map((p, i) => (
          <line
            key={i}
            x1={RADAR_CX}
            y1={RADAR_CY}
            x2={p.x}
            y2={p.y}
            stroke="var(--tm-border)"
            strokeWidth="1"
            opacity={0.4}
          />
        ))}

        {/* Viewer polygon — drawn first so owner sits visually on top */}
        <polygon
          points={pointsToPolygonAttr(viewerPolygon)}
          fill="var(--data-3)"
          fillOpacity="0.10"
          stroke="var(--data-3)"
          strokeWidth="2"
        />

        {/* Owner polygon */}
        <polygon
          points={pointsToPolygonAttr(ownerPolygon)}
          fill="var(--data-1)"
          fillOpacity="0.14"
          stroke="var(--data-1)"
          strokeWidth="2"
        />
      </svg>
      <figcaption
        style={{
          display: "flex",
          gap: 16,
          justifyContent: "center",
          fontSize: 11,
          color: "var(--tm-text-faint)",
          letterSpacing: "0.06em",
          marginTop: 8,
          textTransform: "uppercase",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--data-1)" }} />
          {ownerLabel}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--data-3)" }} />
          {viewerLabel}
        </span>
      </figcaption>
    </figure>
  )
}
