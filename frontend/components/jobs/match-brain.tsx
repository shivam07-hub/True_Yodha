"use client"

import * as React from "react"
import type { JobMatch } from "@/lib/api"

// ── Shared visual helpers for the Matching Brain (Career Ops 5-axis) fields ──

export function gradeTone(grade?: string | null): string {
  if (!grade) return "var(--tm-text-faint)"
  const g = grade[0].toUpperCase()
  if (g === "A") return "var(--tm-success)"
  if (g === "B") return "var(--tm-interactive)"
  if (g === "C") return "var(--tm-warning)"
  return "var(--tm-danger)"
}

export function verdictTone(rec?: string | null): string {
  switch (rec) {
    case "Apply":
      return "var(--tm-success)"
    case "Negotiate":
      return "var(--tm-warning)"
    case "Skip":
      return "var(--tm-danger)"
    default:
      return "var(--tm-text-faint)"
  }
}

export function GradeBadge({ grade }: { grade?: string | null }) {
  if (!grade) return null
  const tone = gradeTone(grade)
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 30,
        padding: "2px 7px",
        borderRadius: 6,
        border: `1px solid ${tone}`,
        background: "transparent",
        color: tone,
        fontFamily: "var(--tm-font-mono)",
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: "0.02em",
      }}
    >
      {grade}
    </span>
  )
}

export function VerdictPill({ recommendation }: { recommendation?: string | null }) {
  if (!recommendation) return null
  const tone = verdictTone(recommendation)
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: 999,
        border: `1px solid ${tone}`,
        background: "transparent",
        color: tone,
        fontFamily: "var(--tm-font-mono)",
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}
    >
      {recommendation}
    </span>
  )
}

/**
 * Career Ops Block G legitimacy flag. Design-over-words: a clean "high_confidence"
 * posting shows NOTHING (no reassurance clutter) — the badge only appears to WARN,
 * amber for caution, red for a suspicious / possible-ghost posting.
 */
export function LegitimacyBadge({ tier, reason }: { tier?: string | null; reason?: string | null }) {
  if (tier !== "caution" && tier !== "suspicious") return null
  const suspicious = tier === "suspicious"
  const tone = suspicious ? "var(--tm-danger)" : "var(--tm-warning)"
  return (
    <span
      title={reason || undefined}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 999,
        border: `1px solid ${tone}`, background: "transparent", color: tone,
        fontFamily: "var(--tm-font-mono)", fontSize: 11, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.06em",
      }}
    >
      ⚠ {suspicious ? "Possible ghost job" : "Check details"}
    </span>
  )
}

export function ArchetypeChip({ archetype }: { archetype?: string | null }) {
  if (!archetype) return null
  return (
    <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-muted)", padding: "3px 8px", borderRadius: 6, background: "var(--tm-int-bg-wash)" }}>
      {archetype}
    </span>
  )
}

// ── 5-axis breakdown ─────────────────────────────────────────────────────────

/** The 5 axes any brain eval carries — a subset both `JobMatch` and
 *  `MatchBrainResult` (on-demand) structurally satisfy, so AxisBreakdown renders
 *  for either without coupling to the whole match row. */
export interface AxisScores {
  role_fit?: number | null
  comp_fit?: number | null
  growth_fit?: number | null
  culture_fit?: number | null
  risk_score?: number | null
}

const AXES: { key: keyof AxisScores; label: string; invert?: boolean }[] = [
  { key: "role_fit", label: "Role fit" },
  { key: "comp_fit", label: "Comp fit" },
  { key: "growth_fit", label: "Growth" },
  { key: "culture_fit", label: "Culture" },
  { key: "risk_score", label: "Risk", invert: true }, // higher = worse
]

function AxisBar({ label, value, invert }: { label: string; value: number | null | undefined; invert?: boolean }) {
  const v = typeof value === "number" ? Math.max(0, Math.min(5, value)) : null
  const pct = v == null ? 0 : (v / 5) * 100
  // For risk, a high value is bad → red; for others, high is good → green.
  const good = invert ? v != null && v <= 2 : v != null && v >= 3.5
  const mid = v != null && !good && (invert ? v <= 3.5 : v >= 2.5)
  const tone = v == null
    ? "var(--tm-text-faint)"
    : good
      ? "var(--tm-success)"
      : mid
        ? "var(--tm-warning)"
        : "var(--tm-danger)"
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 64, fontSize: 11, fontFamily: "var(--tm-font-mono)", color: "var(--tm-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div style={{ flex: 1, height: 6, borderRadius: 999, background: "var(--tm-border)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: tone, borderRadius: 999, transition: "width 500ms var(--tm-ease)" }} />
      </div>
      <div style={{ width: 30, textAlign: "right", fontSize: 11, fontFamily: "var(--tm-font-mono)", color: tone }}>
        {v == null ? "—" : v.toFixed(1)}
      </div>
    </div>
  )
}

export function AxisBreakdown({ job }: { job: AxisScores }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {AXES.map((a) => (
        <AxisBar key={a.key} label={a.label} value={job[a.key] as number | null | undefined} invert={a.invert} />
      ))}
    </div>
  )
}

function PointList({ title, points, tone }: { title: string; points: string[]; tone: string }) {
  if (!points.length) return null
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: tone, fontFamily: "var(--tm-font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
        {title}
      </div>
      <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
        {points.map((p, i) => (
          <li key={i} style={{ fontSize: 13, color: "var(--tm-text-muted)", lineHeight: 1.5 }}>{p}</li>
        ))}
      </ul>
    </div>
  )
}

// ── Detail modal ("the breakdown") ───────────────────────────────────────────

export function JobMatchDetail({ job, onClose }: { job: JobMatch; onClose: () => void }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const hasBrain = job.overall_score != null || !!job.grade || !!job.summary

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Match breakdown for ${job.title}`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          maxHeight: "88vh",
          overflowY: "auto",
          background: "var(--tm-surface)",
          border: "1px solid var(--tm-int-border)",
          borderRadius: 14,
          padding: 22,
          boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-interactive)", marginBottom: 4 }}>
              {job.company || "Unknown company"}
            </div>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--tm-text)", lineHeight: 1.25 }}>{job.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: "transparent", border: "none", color: "var(--tm-interactive-rest)", fontSize: 22, cursor: "pointer", lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <GradeBadge grade={job.grade} />
          <VerdictPill recommendation={job.recommendation} />
          <LegitimacyBadge tier={job.legitimacy_tier} reason={job.legitimacy_reason} />
          <ArchetypeChip archetype={job.archetype} />
          {job.overall_score != null ? (
            <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 12, color: "var(--tm-text-muted)" }}>
              {job.overall_score.toFixed(1)}/5.0 overall
            </span>
          ) : null}
          <span style={{ marginLeft: "auto", fontFamily: "var(--tm-font-mono)", fontSize: 12, color: "var(--tm-text-faint)" }}>
            {Math.round(job.overlap_score)}% skill overlap
          </span>
        </div>

        {!hasBrain ? (
          <p style={{ marginTop: 16, fontSize: 13, color: "var(--tm-text-faint)" }}>
            Deep evaluation not available yet for this role. Refresh your matches to run the Matching Brain.
          </p>
        ) : (
          <>
            {job.summary ? (
              <p style={{ marginTop: 14, fontSize: 14, color: "var(--tm-text)", lineHeight: 1.6 }}>{job.summary}</p>
            ) : null}

            <div style={{ marginTop: 16 }}>
              <AxisBreakdown job={job} />
            </div>

            {job.application_angle ? (
              <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 10, background: "var(--tm-int-bg-wash)", border: "1px solid var(--tm-int-border)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tm-interactive)", fontFamily: "var(--tm-font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                  How to position
                </div>
                <p style={{ margin: 0, fontSize: 13, color: "var(--tm-text-muted)", lineHeight: 1.6 }}>{job.application_angle}</p>
              </div>
            ) : null}

            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
              <PointList title="Strengths" points={job.strengths || []} tone="var(--tm-success)" />
              <PointList title="Concerns" points={job.concerns || []} tone="var(--tm-danger)" />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
