"use client"

import Link from "next/link"
import type { JobSearchItem, JobMatch, GapSkill } from "@/lib/api"

interface JobFitPanelProps {
  job: JobSearchItem
  matchData?: JobMatch
  gapSkills: GapSkill[]
  onClose: () => void
  onTrack: () => void
  tracked?: boolean
}

const P = {
  surf: "var(--tm-surface)",
  border: "var(--tm-border-soft)",
  ac: "var(--tm-interactive)",
  acw: "var(--tm-int-bg-wash)",
  acr: "var(--tm-int-border)",
  text: "var(--tm-text)",
  muted: "var(--tm-text-muted)",
  faint: "var(--tm-text-faint)",
  warn: "var(--tm-warning)",
  warnW: "var(--tm-warning-wash)",
  warnB: "var(--tm-warning-border)",
}

function PillGood({ label }: { label: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 10px", borderRadius: 999, fontSize: 11,
      background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)",
      color: "#4ADE80",
    }}>
      ✓ {label}
    </span>
  )
}

function PillGap({ label, skill }: { label: string; skill: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "3px 6px 3px 10px", borderRadius: 999, fontSize: 11,
      background: P.warnW, border: `1px solid ${P.warnB}`,
      color: P.warn,
    }}>
      ✗ {label}
      <Link
        href={`/skills?skill=${encodeURIComponent(skill)}`}
        style={{
          fontSize: 10, padding: "1px 6px", borderRadius: 999,
          background: P.warnW, border: `1px solid ${P.warnB}`,
          color: P.warn, textDecoration: "none", fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        Forge →
      </Link>
    </span>
  )
}

export function JobFitPanel({ job, matchData, gapSkills, onClose, onTrack, tracked }: JobFitPanelProps) {
  const overlapPct = matchData ? Math.round(matchData.overlap_score * 100) : null
  const matchedSkills = matchData?.matched_skills ?? []
  const jobGaps = gapSkills.slice(0, 4)

  const topRisingSkills = [
    "Python", "TypeScript", "dbt", "Spark", "LangChain",
    "Kubernetes", "GraphQL", "Terraform",
  ]

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 12, overflowY: "auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: P.ac, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3, opacity: 0.7 }}>
            Job Fit Analysis
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: P.text, lineHeight: 1.3, marginBottom: 2 }}>
            {job.job_title || "—"}
          </div>
          <div style={{ fontSize: 12, color: P.muted }}>{job.company_name ?? ""}</div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none", border: `1px solid ${P.border}`, borderRadius: 6,
            color: P.muted, cursor: "pointer", padding: "3px 8px",
            fontSize: 12, fontFamily: "inherit", flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = P.acr; e.currentTarget.style.color = P.ac }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = P.border; e.currentTarget.style.color = P.muted }}
        >
          ✕
        </button>
      </div>

      {/* Overlap bar */}
      {overlapPct !== null && (
        <div style={{ padding: "10px 12px", borderRadius: 8, background: P.acw, border: `1px solid ${P.acr}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: P.ac, letterSpacing: "0.08em", textTransform: "uppercase" }}>Skill Match</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: P.ac, fontVariantNumeric: "tabular-nums" }}>{overlapPct}%</span>
          </div>
          <div style={{ height: 4, borderRadius: 999, background: P.border, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 999,
              width: `${overlapPct}%`,
              background: `linear-gradient(90deg, ${P.acr}, ${P.ac})`,
              boxShadow: `0 0 8px var(--tm-int-bg-hover)`,
              transition: "width 800ms cubic-bezier(0.16,1,0.3,1)",
            }} />
          </div>
        </div>
      )}

      {/* Why it's a good fit */}
      <div style={{ padding: "12px", borderRadius: 8, background: P.surf, border: `1px solid ${P.border}` }}>
        <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: P.faint, marginBottom: 8 }}>
          Why it&apos;s a good fit
        </div>
        <div style={{ fontSize: 12, color: P.muted, lineHeight: 1.6 }}>
          {matchData?.llm_explanation
            ? matchData.llm_explanation
            : "Upload your CV and compute matches to see a personalised fit explanation for this role."}
        </div>
      </div>

      {/* You have */}
      {matchedSkills.length > 0 && (
        <div style={{ padding: "12px", borderRadius: 8, background: P.surf, border: `1px solid ${P.border}` }}>
          <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: P.faint, marginBottom: 8 }}>
            You have
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {matchedSkills.slice(0, 8).map((s) => <PillGood key={s} label={s} />)}
          </div>
        </div>
      )}

      {/* Gaps */}
      {jobGaps.length > 0 && (
        <div style={{ padding: "12px", borderRadius: 8, background: P.surf, border: `1px solid ${P.border}` }}>
          <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: P.faint, marginBottom: 8 }}>
            Gaps to forge
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {jobGaps.map((g) => <PillGap key={g.skill} label={g.skill} skill={g.skill} />)}
          </div>
        </div>
      )}

      {/* Market Pulse */}
      <div style={{ padding: "12px", borderRadius: 8, background: P.surf, border: `1px solid ${P.border}` }}>
        <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: P.faint, marginBottom: 8 }}>
          Market Pulse — rising skills
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {topRisingSkills.map((s) => (
            <span key={s} style={{
              padding: "3px 9px", borderRadius: 999, fontSize: 11,
              background: "rgba(255,255,255,0.03)", border: `1px solid ${P.border}`,
              color: P.muted,
            }}>
              ↑ {s}
            </span>
          ))}
        </div>
      </div>

      {/* Chrome extension */}
      <div style={{ padding: "12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: `1px solid ${P.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 16 }}>🔌</span>
          <div style={{ fontSize: 12, fontWeight: 600, color: P.text }}>Chrome Extension</div>
        </div>
        <div style={{ fontSize: 11, color: P.faint, lineHeight: 1.5, marginBottom: 8 }}>
          Capture jobs from any job board in one click — they land here automatically.
        </div>
        <div style={{ fontSize: 11, color: P.ac }}>Install extension →</div>
      </div>

      {/* Track CTA */}
      <button
        onClick={onTrack}
        disabled={tracked}
        style={{
          width: "100%", padding: "10px", borderRadius: 8,
          background: tracked ? "rgba(74,222,128,0.08)" : P.acw,
          border: `1px solid ${tracked ? "rgba(74,222,128,0.3)" : P.acr}`,
          color: tracked ? "#4ADE80" : P.ac,
          fontSize: 13, fontWeight: 600, cursor: tracked ? "default" : "pointer",
          fontFamily: "inherit", letterSpacing: "0.02em",
          transition: "all 0.15s",
        }}
      >
        {tracked ? "✓ Added to Track" : "◆ Track this role →"}
      </button>
    </div>
  )
}
