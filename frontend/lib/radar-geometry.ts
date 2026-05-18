/**
 * radar-geometry.ts
 * Pure radar path math — shared between DomainRadar (the live UI),
 * GhostRadar / RadarOverlay (the public profile), and the OG image route.
 *
 * No DOM, no React, no styling — just numbers in, numbers out.
 */

export const RADAR_SVG_SIZE = 280
export const RADAR_CX = 140
export const RADAR_CY = 140
export const RADAR_R = 110
export const RADAR_LEVEL_MAX = 5
export const RADAR_RING_FRACTIONS = [0.25, 0.5, 0.75, 1.0]

export interface RadarPoint {
  x: number
  y: number
}

export function polarToCart(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number,
): RadarPoint {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

export interface RadarShape {
  spokes: RadarPoint[] // 12 outer-tip points
  rings: RadarPoint[][] // outer polygon per fraction
  polygon: RadarPoint[] // the data polygon (per-domain scores)
  labels: { x: number; y: number; domain: string; firstWord: string }[]
}

/**
 * Compute the geometry for a radar from a domain → score(0–1) map.
 *
 * domains is the ordered list of L1 domain names (12 for the Myro radar).
 * Scores are clamped 0–1; pass `undefined` to render an outline-only radar.
 */
export function radarShape(
  domains: string[],
  scoresByDomain?: Record<string, number>,
): RadarShape {
  const n = domains.length
  const angleStep = n > 0 ? 360 / n : 0

  const spokes = domains.map((_, i) =>
    polarToCart(RADAR_CX, RADAR_CY, RADAR_R, i * angleStep),
  )

  const rings = RADAR_RING_FRACTIONS.map((frac) =>
    domains.map((_, i) =>
      polarToCart(RADAR_CX, RADAR_CY, RADAR_R * frac, i * angleStep),
    ),
  )

  const polygon = domains.map((d, i) => {
    const raw = scoresByDomain?.[d]
    const clamped = clamp01(raw)
    return polarToCart(RADAR_CX, RADAR_CY, RADAR_R * clamped, i * angleStep)
  })

  const labels = domains.map((d, i) => {
    const pt = polarToCart(RADAR_CX, RADAR_CY, RADAR_R + 22, i * angleStep)
    return { x: pt.x, y: pt.y, domain: d, firstWord: d.split(" ")[0] ?? d }
  })

  return { spokes, rings, polygon, labels }
}

export function pointsToPolygonAttr(pts: RadarPoint[]): string {
  return pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")
}

function clamp01(v: unknown): number {
  if (typeof v !== "number" || Number.isNaN(v)) return 0
  if (v <= 0) return 0
  if (v >= 1) return 1
  return v
}

/**
 * Domain-score helpers — convert various score representations to 0–1 scalars.
 * Backend may serve scores as 0–5 levels or 0–100 percentages depending on
 * source view; this normalizes for the radar consumer.
 */
export function normalizeDomainScore(value: number | null | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0
  if (value <= 1) return clamp01(value)
  if (value <= RADAR_LEVEL_MAX) return value / RADAR_LEVEL_MAX
  // assume 0–100
  return clamp01(value / 100)
}

export function normalizeDomainScoresMap(
  scores: Record<string, number> | null | undefined,
): Record<string, number> {
  if (!scores) return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(scores)) {
    out[k] = normalizeDomainScore(v)
  }
  return out
}
