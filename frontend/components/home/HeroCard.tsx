"use client"

import Link from "next/link"
import { SkillRow } from "./SkillRow"
import { InfoPill } from "./interaction-pills"
import { ApplyRow } from "@/components/jobs/apply-row"
import type { JobMatch, ApplicationStatus, SkillGapResponse } from "@/lib/api"
import { isStretch, verdictColor, verdictLabel } from "@/lib/jobs/match-verdict"
import { stripMarkdown } from "@/lib/text/strip-markdown"

const STAGE_OPTIONS: { value: ApplicationStatus; label: string }[] = [
  { value: "saved", label: "Saved" },
  { value: "applied", label: "Applied" },
  { value: "interviewing", label: "Interviewing" },
]

const OUTCOME_OPTIONS: { value: ApplicationStatus; label: string }[] = [
  { value: "ghosted", label: "Ghosted" },
  { value: "rejected", label: "Rejected" },
  { value: "offer", label: "Offer 🎉" },
]

function statusColor(s: ApplicationStatus): string {
  if (s === "applied") return "var(--tm-interactive)"
  if (s === "interviewing" || s === "offer") return "var(--tm-success)"
  if (s === "rejected" || s === "ghosted") return "var(--tm-danger)"
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
  // Headline = the Match Verdict number (brain-spined + overlap-gated), not raw overlap.
  const fit = Math.min(100, job.match_score)
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

        {/* Match badge — the ONE number + the verdict word (Match Verdict) */}
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 32, fontWeight: 700, color, lineHeight: 1, letterSpacing: "-0.02em" }}>
            {fit}
          </div>
          <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: verdictColor(job.verdict), letterSpacing: "0.06em", marginTop: 3 }}>
            {verdictLabel(job.verdict)}
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

      {/* Stretch honesty — never a dead end: name it early + the lift move */}
      {isStretch(job.verdict) && (
        <div style={{
          marginTop: 14, padding: "10px 12px", borderRadius: 8,
          background: "var(--tm-warning-wash, rgba(255,180,0,0.08))",
          border: "1px solid var(--tm-border-soft)",
          fontSize: 12.5, lineHeight: 1.5, color: "var(--tm-text-muted)",
        }}>
          Closest match — you&apos;re early for this one.{" "}
          {missingSkills[0]
            ? <>Practice <strong style={{ color: "var(--tm-text)" }}>{missingSkills[0].skill}</strong> and tailor your CV to lift it.</>
            : <>Tailor your CV to this role to lift it.</>}
        </div>
      )}

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
          → Tailor &amp; apply
        </Link>
        {/* Door 2 — download the master CV without tailoring. */}
        <Link
          href="/cv?master=1"
          style={{
            display: "inline-flex", alignItems: "center",
            padding: "9px 18px", borderRadius: 99,
            background: "transparent", textDecoration: "none",
            color: "var(--tm-text-muted)", fontSize: 13, fontWeight: 600,
            border: "1px solid var(--tm-border-soft)",
            transition: "color 150ms, border-color 150ms",
          }}
          onMouseEnter={e => { e.currentTarget.style.color = "var(--tm-text)"; e.currentTarget.style.borderColor = "var(--tm-int-border)" }}
          onMouseLeave={e => { e.currentTarget.style.color = "var(--tm-text-muted)"; e.currentTarget.style.borderColor = "var(--tm-border-soft)" }}
        >
          ↓ Download my CV
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
              {stripMarkdown(job.llm_explanation) || (
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
