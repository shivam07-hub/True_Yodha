"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { ScoreGauge } from "./score-gauge"
import { cv as cvApi, users } from "@/lib/api"
import type { ScoreResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { DOMAIN_LABELS } from "@/lib/domain-labels"
import { DownloadCVButton } from "@/components/cv/download-cv-button"

interface Props {
  score: ScoreResponse
  token: string
}

export function StepScore({ score, token }: Props) {
  const router = useRouter()
  const top3gaps = score.gap_skills.slice(0, 3)

  // Resolve the just-parsed master CV so the user can download it right at the
  // score reveal — the climax of onboarding (10-min CV North Star).
  const versionsQuery = useQuery({
    queryKey: dataKeys.cvVersions(null),
    queryFn: () => cvApi.versions.list(token, null),
    enabled: !!token,
  })
  const profileQuery = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => users.me(token),
    enabled: !!token,
  })
  const baseline = useMemo(() => {
    const masters = (versionsQuery.data?.versions ?? [])
      .filter(v => v.kind === "baseline_upload")
      .sort((a, b) => b.user_version_number - a.user_version_number)
    return masters[0] ?? null
  }, [versionsQuery.data])

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 32, width: "100%", maxWidth: 512 }}>
      <div style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: "var(--tm-fs-title)", fontWeight: 700, color: "var(--tm-text)", marginBottom: 6, letterSpacing: "var(--tm-tracking-tight)" }}>
          Your Myro Score
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
                    height: "100%", width: "100%",
                    background: "var(--tm-interactive)",
                    borderRadius: 999,
                    transform: `scaleX(${val / 100})`,
                    transformOrigin: "left",
                    transition: "transform 700ms var(--tm-ease)",
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
                  color: "var(--tm-interactive)", background: "var(--tm-int-bg-wash)",
                  border: "1px solid var(--tm-int-border)",
                  whiteSpace: "nowrap",
                }}>
                  L{g.current_level} → L{g.target_level}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
        <DownloadCVButton
          token={token}
          baseline={baseline}
          fullName={profileQuery.data?.full_name}
          label="Download your CV"
          style={{
            width: "100%", padding: "14px",
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
            background: "var(--tm-interactive)", border: "1px solid var(--tm-interactive)",
            color: "var(--tm-interactive-fg)", borderRadius: "var(--tm-radius)",
            fontSize: "var(--tm-fs-body)", fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}
        />
        <button
          onClick={() => router.push("/forge")}
          style={{
            width: "100%", padding: "12px",
            background: "transparent", border: "1px solid var(--tm-border)",
            color: "var(--tm-text-muted)", borderRadius: "var(--tm-radius)",
            fontSize: "var(--tm-fs-meta)", fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          See Full Skill Intelligence →
        </button>
      </div>
    </div>
  )
}
