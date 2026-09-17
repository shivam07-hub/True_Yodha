"use client"

import * as React from "react"
import { ArchetypeChip, LegitimacyBadge } from "@/components/jobs/match-brain"
import { useMatchBrain } from "@/lib/hooks/use-match-brain"

/**
 * "Myro's take" — the Matching Brain's reasoning about ONE job, wherever it's
 * opened (Consolidation D: brain-everywhere). Reads the on-open eval via the
 * shared `useMatchBrain` hook (the backend computes it once and caches it, so
 * repeat opens are free + opening warms the card). Design-over-words: if the
 * brain has nothing to say (unavailable / not yet scored) the panel renders
 * NOTHING rather than an apology.
 *
 * HOW GOOD IS NOT ASKED HERE. The ring on the card is the Match Verdict, and it
 * is the one answer (CONTEXT.md). This panel used to restate it four more times
 * — a letter grade, an Apply/Negotiate pill, "3.8/5.0", and five axis bars — so
 * one job carried five claims about its own quality, in four vocabularies. What
 * is left is the part the ring cannot say: why, what to watch, and how to apply.
 */
export function MyroTake({ token, jobId }: { token: string; jobId: string }) {
  const { result } = useMatchBrain(token, jobId)

  const r = result
  if (!r || !r.available || r.overall_score == null) return null
  // The line written TO the reader when the row has been rated under the v2
  // prompt; the evaluator's own summary until then.
  const line = r.pick_reason || r.summary

  return (
    <div style={panelStyle}>
      <Label />
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: line ? 12 : 0 }}>
        {/* What the role IS, and whether the posting is real. Never a second
            reading of how good it is — that is the ring's answer, once. */}
        <ArchetypeChip archetype={r.archetype} />
        <LegitimacyBadge tier={r.legitimacy_tier} reason={r.legitimacy_reason} />
      </div>

      {line ? (
        <p style={{ margin: "0 0 14px", fontSize: "var(--tm-fs-body)", color: "var(--tm-text)", lineHeight: 1.6 }}>{line}</p>
      ) : null}

      {r.application_angle ? (
        <div style={{ marginTop: 14, padding: "11px 13px", borderRadius: 10, background: "var(--tm-int-bg-wash)", border: "1px solid var(--tm-int-border)" }}>
          <div style={miniLabelStyle}>How to position</div>
          <p style={{ margin: 0, fontSize: "var(--tm-fs-body)", color: "var(--tm-text-muted)", lineHeight: 1.6 }}>{r.application_angle}</p>
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
  fontSize: "var(--tm-fs-caption)",
  fontWeight: 600,
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
          <li key={i} style={{ fontSize: "var(--tm-fs-body)", color: "var(--tm-text-muted)", lineHeight: 1.5 }}>{p}</li>
        ))}
      </ul>
    </div>
  )
}
