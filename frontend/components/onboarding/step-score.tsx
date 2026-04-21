"use client"

import { useRouter } from "next/navigation"
import { ScoreGauge } from "./score-gauge"
import type { ScoreResponse } from "@/lib/api"

interface Props {
  score: ScoreResponse
}

const DOMAIN_LABELS: Record<string, string> = {
  SD: "Software Dev",
  DE: "Data Engineering",
  AML: "AI / ML",
  CLD: "Cloud",
  SEC: "Security",
  PMG: "Product Mgmt",
  BIZ: "Business",
  COM: "Communication",
  LDR: "Leadership",
  OPS: "Operations",
}

export function StepScore({ score }: Props) {
  const router = useRouter()
  const top3gaps = score.gap_skills.slice(0, 3)

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 32, width: "100%", maxWidth: 512 }}>
      <div style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: "var(--tm-fs-title)", fontWeight: 700, color: "var(--tm-text)", marginBottom: 6, letterSpacing: "var(--tm-tracking-tight)" }}>
          Your Mirror Score
        </h2>
        <p style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-muted)" }}>
          Based on your CV vs live market demand
        </p>
      </div>

      <ScoreGauge score={score.total_score} />

      {/* Domain breakdown */}
      <div style={{ width: "100%" }}>
        <h3 style={{ fontSize: "var(--tm-fs-meta)", fontWeight: 600, color: "var(--tm-text)", marginBottom: 12 }}>
          Domain breakdown
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.entries(score.domain_scores).map(([key, val]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-muted)", width: 96, flexShrink: 0 }}>
                {DOMAIN_LABELS[key] ?? key}
              </span>
              <div style={{ flex: 1, background: "var(--tm-surface-2)", borderRadius: 999, height: 6, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%", width: `${val}%`,
                    background: "var(--tm-accent)",
                    borderRadius: 999,
                    transition: "width 700ms var(--tm-ease)",
                  }}
                />
              </div>
              <span style={{ fontSize: "var(--tm-fs-meta)", fontWeight: 600, color: "var(--tm-text)", width: 28, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {val}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Top skill gaps */}
      {top3gaps.length > 0 && (
        <div style={{ width: "100%" }}>
          <h3 style={{ fontSize: "var(--tm-fs-meta)", fontWeight: 600, color: "var(--tm-text)", marginBottom: 12 }}>
            Top skills to upgrade
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {top3gaps.map((g) => (
              <div key={g.skill} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)",
                padding: "12px 16px", gap: 12,
              }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: "var(--tm-fs-body)", fontWeight: 500, color: "var(--tm-text)", marginBottom: 2 }}>{g.skill}</p>
                  <p style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-muted)" }}>{g.why_it_matters}</p>
                </div>
                <span style={{
                  flexShrink: 0, marginLeft: 12,
                  padding: "3px 10px", borderRadius: "var(--tm-radius-pill)",
                  fontSize: "var(--tm-fs-meta)", fontWeight: 600,
                  color: "var(--tm-accent)", background: "var(--tm-accent-wash)",
                  border: "1px solid var(--tm-accent-ring)",
                  whiteSpace: "nowrap",
                }}>
                  L{g.current_level} → L{g.target_level}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => router.push("/dashboard")}
        style={{
          width: "100%", padding: "14px",
          background: "var(--tm-accent)", border: "1px solid var(--tm-accent)",
          color: "var(--tm-accent-fg)", borderRadius: "var(--tm-radius)",
          fontSize: "var(--tm-fs-body)", fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--tm-accent-hover)"; e.currentTarget.style.borderColor = "var(--tm-accent-hover)" }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "var(--tm-accent)"; e.currentTarget.style.borderColor = "var(--tm-accent)" }}
      >
        See full dashboard →
      </button>
    </div>
  )
}
