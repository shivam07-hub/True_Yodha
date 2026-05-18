import { ImageResponse } from "next/og"

import {
  RADAR_CX,
  RADAR_CY,
  RADAR_SVG_SIZE,
  normalizeDomainScoresMap,
  pointsToPolygonAttr,
  radarShape,
} from "@/lib/radar-geometry"

export const runtime = "edge"
export const revalidate = 86400 // 24h cache
export const alt = "Myro Domain Map"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

interface PublicProfilePayload {
  ninja_name: string
  mirror_score: number | null
  domain_scores: Record<string, number> | null
  tier_label: string | null
}

function apiBase(): string {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_INTERNAL_URL ??
    ""
  )
}

async function fetchProfile(ninja: string): Promise<PublicProfilePayload | null> {
  const base = apiBase()
  if (!base) return null
  const res = await fetch(`${base}/profile/${encodeURIComponent(ninja)}`)
  if (!res.ok) return null
  return (await res.json()) as PublicProfilePayload
}

export default async function OG({ params }: { params: { ninja: string } }) {
  const profile = await fetchProfile(params.ninja.toLowerCase())
  const name = profile?.ninja_name ?? params.ninja
  const score = profile?.mirror_score != null ? Math.round(profile.mirror_score) : null
  const tier = profile?.tier_label ?? ""

  const domains = Object.keys(profile?.domain_scores ?? {}).sort()
  const normalized = normalizeDomainScoresMap(profile?.domain_scores ?? null)
  const { spokes, rings, polygon } = radarShape(domains, normalized)

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#050A18",
          color: "#E8ECF7",
          fontFamily: "monospace",
          padding: 64,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                fontSize: 14,
                letterSpacing: "0.24em",
                textTransform: "uppercase",
                color: "#6F7891",
                display: "flex",
              }}
            >
              Myro · Domain Map
            </div>
            <div style={{ fontSize: 64, fontWeight: 600, display: "flex" }}>{name}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {score != null ? (
              <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
                <span style={{ fontSize: 96, fontWeight: 700, color: "#00F5D4" }}>{score}</span>
                <span style={{ fontSize: 22, color: "#6F7891" }}>/ 100</span>
              </div>
            ) : (
              <div style={{ fontSize: 28, color: "#6F7891", display: "flex" }}>
                No score yet
              </div>
            )}
            {tier ? (
              <div style={{ fontSize: 20, color: "#A4ABC2", display: "flex" }}>{tier}</div>
            ) : null}
          </div>
        </div>
        <div
          style={{
            width: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width={RADAR_SVG_SIZE * 1.5}
            height={RADAR_SVG_SIZE * 1.5}
            viewBox={`0 0 ${RADAR_SVG_SIZE} ${RADAR_SVG_SIZE}`}
          >
            {rings.map((pts, i) => (
              <polygon
                key={i}
                points={pointsToPolygonAttr(pts)}
                fill="none"
                stroke="rgba(255,255,255,0.10)"
                strokeWidth="1"
              />
            ))}
            {spokes.map((p, i) => (
              <line
                key={i}
                x1={RADAR_CX}
                y1={RADAR_CY}
                x2={p.x}
                y2={p.y}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
            ))}
            <polygon
              points={pointsToPolygonAttr(polygon)}
              fill="#00F5D4"
              fillOpacity="0.18"
              stroke="#00F5D4"
              strokeWidth="2.5"
            />
          </svg>
        </div>
      </div>
    ),
    { ...size },
  )
}
