"use client"

import Link from "next/link"
import type { ApplicationResponse, ApplicationStatus } from "@/lib/api"
import { daysAgo } from "@/lib/forge-helpers"

// ── PipelineCol ───────────────────────────────────────────────────────────────

interface PipelineColProps {
  apps: ApplicationResponse[]
  activeJobId: string
  onPick: (jobId: string) => void
}

export function PipelineCol({ apps, activeJobId, onPick }: PipelineColProps) {
  function stColor(status: ApplicationStatus): string {
    if (status === "applied" || status === "responded") return "var(--tm-accent)"
    if (status === "interviewing" || status === "offer") return "var(--tm-success)"
    if (status === "rejected" || status === "abandoned") return "var(--tm-danger)"
    return "var(--tm-text-faint)"
  }

  return (
    <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 10, padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, letterSpacing: "0.1em", color: "var(--tm-text-faint)", textTransform: "uppercase", fontWeight: 600 }}>Pipeline · all targets</span>
        <Link href="/tracker" style={{ fontSize: 11.5, color: "var(--tm-text-muted)", display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}>All →</Link>
      </div>
      {apps.slice(0, 5).map(app => {
        const isActive = app.job_id === activeJobId
        const c = stColor(app.status)
        return (
          <div
            key={app.id}
            onClick={() => onPick(app.job_id)}
            style={{
              display: "grid", gridTemplateColumns: "1fr auto", gap: "6px 12px",
              padding: "12px 6px", borderBottom: "1px solid var(--tm-border-soft)",
              alignItems: "center", cursor: "pointer", borderRadius: 6,
              background: isActive ? "rgba(0,245,212,0.06)" : "transparent",
              transition: "all 120ms var(--tm-ease)",
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tm-text)" }}>{app.company ?? app.title}</div>
              <div style={{ fontSize: 11, color: "var(--tm-text-faint)", marginTop: 2 }}>{app.title}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <span style={{
                fontSize: 10, color: c, padding: "2px 9px", borderRadius: 99,
                border: `1px solid ${c}55`, background: `${c}10`,
                fontFamily: "var(--tm-font-mono)", letterSpacing: "0.06em", textTransform: "uppercase",
              }}>
                {app.status}
              </span>
              <span style={{ fontSize: 10, color: "var(--tm-text-faint)", fontFamily: "var(--tm-font-mono)" }}>
                {daysAgo(app.created_at)}
              </span>
            </div>
          </div>
        )
      })}
      {apps.length === 0 && <div style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>No applications yet</div>}
    </div>
  )
}

// ── CVCol ─────────────────────────────────────────────────────────────────────

interface CVColProps {
  job: { overlap_score: number; company: string | null }
  onSpendXP: (amount: number, action: string) => void
}

export function CVCol({ job, onSpendXP }: CVColProps) {
  const fit = Math.min(100, Math.round(job.overlap_score))
  const color = fit >= 70 ? "var(--tm-success)" : fit >= 50 ? "var(--tm-warning)" : "var(--tm-danger)"

  return (
    <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 10, padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, letterSpacing: "0.1em", color: "var(--tm-text-faint)", textTransform: "uppercase", fontWeight: 600 }}>CV — {job.company}</span>
      </div>
      <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 44, fontWeight: 700, color, lineHeight: 1, letterSpacing: "-0.02em", filter: `drop-shadow(0 0 8px ${color}50)` }}>
        {fit}<span style={{ fontSize: 22, opacity: 0.7 }}>%</span>
      </div>
      <div style={{ height: 4, borderRadius: 99, background: "var(--tm-border)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${fit}%`, borderRadius: 99, background: color, transition: "width 600ms var(--tm-ease)" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
        <button
          onClick={() => onSpendXP(100, "rewrite_cv_line")}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderRadius: 6, border: "1px solid var(--tm-border)",
            background: "rgba(255,255,255,0.02)", fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit", color: "var(--tm-text-muted)",
          }}
        >
          <span>Rewrite CV line</span>
          <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, fontWeight: 700, color: "var(--tm-accent)" }}>◆ 100 XP</span>
        </button>
        <button
          onClick={() => onSpendXP(50, "download_cv")}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderRadius: 6, border: "1px solid var(--tm-border)",
            background: "rgba(255,255,255,0.02)", fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit", color: "var(--tm-text-muted)",
          }}
        >
          <span>Download tailored CV</span>
          <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, fontWeight: 700, color: "var(--tm-accent)" }}>◆ 50 XP</span>
        </button>
        <Link
          href="/cv"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "10px 14px", borderRadius: 6, background: "var(--tm-accent)",
            color: "var(--tm-accent-fg)", fontSize: 12, fontWeight: 700, textDecoration: "none",
          }}
        >
          Open CV Builder →
        </Link>
      </div>
    </div>
  )
}
