"use client"

import * as React from "react"
import {
  GradeBadge,
  VerdictPill,
  LegitimacyBadge,
  ArchetypeChip,
  AxisBreakdown,
} from "@/components/jobs/match-brain"
import { useMatchBrain } from "@/lib/hooks/use-match-brain"

/**
 * "Myro's take" — the Matching Brain's verdict on ONE job, wherever it's opened
 * (Consolidation D: brain-everywhere). Reads the on-open eval via the shared
 * `useMatchBrain` hook (the backend computes it once and caches it, so repeat
 * opens are free + opening warms the card). Design-over-words: if the brain has
 * nothing to say (unavailable / not yet scored) the panel renders NOTHING rather
 * than an apology.
 */
export function MyroTake({ token, jobId }: { token: string; jobId: string }) {
  const { result } = useMatchBrain(token, jobId)

  const r = result
  if (!r || !r.available || r.overall_score == null) return null

  return (
    <div style={panelStyle}>
      <Label />
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: r.summary ? 12 : 0 }}>
        <GradeBadge grade={r.grade} />
        <VerdictPill recommendation={r.recommendation} />
        <LegitimacyBadge tier={r.legitimacy_tier} reason={r.legitimacy_reason} />
        <ArchetypeChip archetype={r.archetype} />
        <span style={{ marginLeft: "auto", fontFamily: "var(--tm-font-mono)", fontSize: 12, color: "var(--tm-text-faint)" }}>
          {r.overall_score.toFixed(1)}/5.0
        </span>
      </div>

      {r.summary ? (
        <p style={{ margin: "0 0 14px", fontSize: 13.5, color: "var(--tm-text)", lineHeight: 1.6 }}>{r.summary}</p>
      ) : null}

      <AxisBreakdown job={r} />

      {r.application_angle ? (
        <div style={{ marginTop: 14, padding: "11px 13px", borderRadius: 10, background: "var(--tm-int-bg-wash)", border: "1px solid var(--tm-int-border)" }}>
          <div style={miniLabelStyle}>How to position</div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--tm-text-muted)", lineHeight: 1.6 }}>{r.application_angle}</p>
        </div>
      ) : null}

      {(r.strengths?.length || r.concerns?.length) ? (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <PointList title="Strengths" points={r.strengths ?? []} tone="var(--tm-success)" />
          <PointList title="Concerns" points={r.concerns ?? []} tone="var(--tm-danger)" />
        </div>
      ) : null}
    </div>
  )
}

const panelStyle: React.CSSProperties = {
  marginBottom: 18,
  padding: "14px 16px",
  borderRadius: 12,
  border: "1px solid var(--tm-int-border-soft)",
  background: "var(--tm-surface)",
}

const miniLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--tm-interactive)",
  fontFamily: "var(--tm-font-mono)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 6,
}

function Label() {
  return (
    <div style={{ ...miniLabelStyle, color: "var(--tm-text-muted)", marginBottom: 10 }}>
      Myro&rsquo;s take
    </div>
  )
}

function PointList({ title, points, tone }: { title: string; points: string[]; tone: string }) {
  if (!points.length) return null
  return (
    <div>
      <div style={{ ...miniLabelStyle, color: tone, marginBottom: 6 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
        {points.map((p, i) => (
          <li key={i} style={{ fontSize: 13, color: "var(--tm-text-muted)", lineHeight: 1.5 }}>{p}</li>
        ))}
      </ul>
    </div>
  )
}
