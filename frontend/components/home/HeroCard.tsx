"use client"

import Link from "next/link"
import { SkillRow } from "./SkillRow"
import { InfoPill } from "./interaction-pills"
import { ApplyRow } from "@/components/jobs/apply-row"
import type { JobMatch, ApplicationStatus, SkillGapResponse } from "@/lib/api"

const STAGE_OPTIONS: { value: ApplicationStatus; label: string }[] = [
  { value: "saved", label: "Saved" },
  { value: "applied", label: "Applied" },
  { value: "screening", label: "Screening" },
  { value: "interviewing", label: "Interviewing" },
  { value: "final_round", label: "Final Round" },
]

const OUTCOME_OPTIONS: { value: ApplicationStatus; label: string }[] = [
  { value: "ghosted", label: "Ghosted" },
  { value: "rejected", label: "Rejected" },
  { value: "offer", label: "Offer 🎉" },
  { value: "withdrew", label: "Withdrew" },
]

function statusColor(s: ApplicationStatus): string {
  if (s === "applied" || s === "screening") return "var(--tm-interactive)"
  if (s === "interviewing" || s === "final_round" || s === "offer") return "var(--tm-success)"
  if (s === "rejected" || s === "ghosted" || s === "withdrew") return "var(--tm-danger)"
  return "var(--tm-text-muted)"
}

function fitColor(fit: number): string {
  if (fit >= 70) return "var(--tm-success)"
  if (fit >= 50) return "var(--tm-warning)"
  return "var(--tm-danger)"
}

interface HeroCardProps {
  job: JobMatch
  status: ApplicationStatus
  skillGapData?: SkillGapResponse
  onStatus: (s: ApplicationStatus) => void
  onForge: () => void
}

export function HeroCard({ job, status, skillGapData, onStatus }: HeroCardProps) {
  const fit = Math.min(100, Math.round(job.overlap_score))
  const color = fitColor(fit)

  const missingSkills = skillGapData?.skills.filter(s => s.missing) ?? []
  // "already match" = user has the skill at any level (even if not yet at required level)
  const matchedSkills = skillGapData?.skills.filter(s => (s.user_level ?? 0) > 0) ?? []

  return (
    <div style={{
      border: "1.5px solid var(--tm-int-border)", borderRadius: 10,
      padding: "24px 26px", position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at 100% 0%, var(--tm-int-bg-wash), transparent 50%)",
      }} />

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, position: "relative" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.12em",
            textTransform: "uppercase", color: "var(--tm-interactive)", marginBottom: 6,
          }}>
            Focused on: {job.company ?? ""}
          </div>
          <h2 style={{
            margin: 0, fontSize: 26, fontWeight: 600,
            letterSpacing: "-0.02em", color: "var(--tm-text)", lineHeight: 1.15,
          }}>
            {job.title}
          </h2>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            fontFamily: "var(--tm-font-mono)", fontSize: 11,
            color: "var(--tm-text-faint)", marginTop: 5, flexWrap: "wrap",
          }}>
            <span>{[job.company, job.location].filter(Boolean).join(" · ")}{job.llm_rank != null && ` · RANK · #${job.llm_rank}`}</span>
            <span style={{ color: "var(--tm-border)" }}>·</span>
            <select
              aria-label="Application status"
              value={status}
              onChange={(e) => onStatus(e.target.value as ApplicationStatus)}
              className="tm-control-focus"
              style={{
                fontSize: 11, fontWeight: 650, color: statusColor(status),
                background: "rgba(255,255,255,0.025)", border: "1px solid var(--tm-border-soft)", borderRadius: 999,
                cursor: "pointer",
                fontFamily: "var(--tm-font-mono)", padding: "4px 24px 4px 10px",
              }}
            >
              <optgroup label="Progress" style={{ background: "var(--tm-surface-2)", color: "var(--tm-text-faint)", fontSize: 10 }}>
                {STAGE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value} style={{ background: "var(--tm-surface-2)", color: "var(--tm-text)" }}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Outcome" style={{ background: "var(--tm-surface-2)", color: "var(--tm-text-faint)", fontSize: 10 }}>
                {OUTCOME_OPTIONS.map(o => (
                  <option key={o.value} value={o.value} style={{ background: "var(--tm-surface-2)", color: "var(--tm-text)" }}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>

        {/* Fit badge */}
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 32, fontWeight: 700, color, lineHeight: 1, letterSpacing: "-0.02em" }}>
            {fit}
          </div>
          <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, textTransform: "uppercase", color: "var(--tm-text-faint)", letterSpacing: "0.06em", marginTop: 2 }}>
            fit
          </div>
        </div>
      </div>

      {/* Apply row — Open careers / Copy ID / Copy title */}
      <div style={{ marginTop: 10 }}>
        <ApplyRow company={job.company} title={job.title} jobId={job.job_id} variant="compact" />
      </div>

      {/* Fit bar */}
      <div style={{ height: 4, borderRadius: 99, background: "var(--tm-border)", overflow: "hidden", marginTop: 14 }}>
        <div style={{
          height: "100%", width: `${fit}%`, borderRadius: 99, background: color,
          boxShadow: `0 0 6px ${color}40`,
          transition: "width 600ms var(--tm-ease)",
        }} />
      </div>

      {/* Skill pills */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
        {job.matched_skills?.slice(0, 5).map(s => (
          <InfoPill key={s} tone="success">✓ {s}</InfoPill>
        ))}
        {missingSkills.slice(0, 2).map(s => (
          <InfoPill key={s.skill} tone="danger">Missing · {s.skill}</InfoPill>
        ))}
      </div>

      {/* Actions row — CV CTA always visible, no Forge button on job card */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <Link
          href={`/cv?jobId=${job.job_id}`}
          style={{
            display: "inline-flex", alignItems: "center",
            padding: "9px 20px", borderRadius: 99,
            background: "var(--tm-interactive)", textDecoration: "none",
            color: "var(--tm-interactive-fg)", fontSize: 13, fontWeight: 700,
            boxShadow: "0 0 12px var(--tm-int-border)",
            transition: "opacity 150ms",
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = "0.85" }}
          onMouseLeave={e => { e.currentTarget.style.opacity = "1" }}
        >
          → Tailor CV for this role
        </Link>
      </div>

      {/* Expanded block */}
      {(
        <div style={{ borderTop: "1px dashed var(--tm-border)", marginTop: 16, paddingTop: 16, display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Why this is a good fit — full width */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{
                fontSize: 11, fontWeight: 700, color: "var(--tm-text-muted)",
                fontFamily: "var(--tm-font-mono)", textTransform: "uppercase", letterSpacing: "0.08em",
              }}>Why this is a good fit</span>
              <InfoPill tone="accent" style={{ minHeight: 22, borderRadius: 6 }}>LLM</InfoPill>
            </div>
            <p style={{
              margin: 0, fontSize: 13, color: "var(--tm-text-muted)", lineHeight: 1.65,
              paddingLeft: 12, borderLeft: "2px solid var(--tm-interactive)",
            }}>
              {job.llm_explanation ?? (
                <span style={{ color: "var(--tm-text-faint)", fontStyle: "italic" }}>No explanation available.</span>
              )}
            </p>
          </div>

          {/* Skills you already match */}
          {matchedSkills.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: "var(--tm-text-muted)",
                  fontFamily: "var(--tm-font-mono)", textTransform: "uppercase", letterSpacing: "0.08em",
                }}>Skills you already match</span>
                <InfoPill tone="success" style={{ minHeight: 22, borderRadius: 6 }}>{matchedSkills.length}</InfoPill>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {[...matchedSkills].sort((a, b) => (b.user_level ?? 0) - (a.user_level ?? 0)).map(s => (
                  <SkillRow key={s.skill} skill={s} inCart={false} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
