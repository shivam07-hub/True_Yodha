"use client"

import { SkillRow } from "./SkillRow"
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
  if (s === "applied" || s === "screening") return "var(--tm-accent)"
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

export function HeroCard({ job, status, skillGapData, onStatus, onForge }: HeroCardProps) {
  const fit = Math.min(100, Math.round(job.overlap_score))
  const color = fitColor(fit)

  const missingSkills = skillGapData?.skills.filter(s => s.missing) ?? []
  // "already match" = user has the skill at any level (even if not yet at required level)
  const matchedSkills = skillGapData?.skills.filter(s => (s.user_level ?? 0) > 0) ?? []
  const firstGap = missingSkills[0]?.skill ?? "next gap"

  return (
    <div style={{
      border: "1.5px solid var(--tm-accent-ring)", borderRadius: 10,
      padding: "24px 26px", position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at 100% 0%, rgba(0,245,212,0.06), transparent 50%)",
      }} />

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, position: "relative" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "var(--tm-font-mono)", fontSize: 11, letterSpacing: "0.12em",
            textTransform: "uppercase", color: "var(--tm-accent)", marginBottom: 6,
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
            {job.job_id && (
              <>
                <span style={{ color: "var(--tm-border)" }}>·</span>
                <span style={{
                  padding: "1px 6px", borderRadius: 4,
                  border: "1px dashed var(--tm-border)", color: "var(--tm-text-muted)",
                  cursor: "copy", fontSize: 11,
                }}
                  onClick={() => navigator.clipboard.writeText(String(job.job_id))}
                  title="Copy Job ID"
                >
                  {job.job_id}
                </span>
                {job.source_url && (
                  <a
                    href={job.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--tm-text-muted)", textDecoration: "none", fontSize: 11 }}
                  >
                    Open JD ↗
                  </a>
                )}
              </>
            )}
            <span style={{ color: "var(--tm-border)" }}>·</span>
            <select
              value={status}
              onChange={(e) => onStatus(e.target.value as ApplicationStatus)}
              style={{
                fontSize: 11, fontWeight: 600, color: statusColor(status),
                background: "transparent", border: "none", cursor: "pointer",
                fontFamily: "var(--tm-font-mono)", padding: 0, outline: "none",
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
          <span key={s} style={{
            padding: "2px 9px", borderRadius: 99,
            background: "rgba(74,222,128,0.10)", border: "1px solid var(--tm-success)",
            color: "var(--tm-success)", fontSize: 11,
          }}>✓ {s}</span>
        ))}
        {missingSkills.slice(0, 2).map(s => (
          <span key={s.skill} style={{
            padding: "2px 9px", borderRadius: 99,
            background: "rgba(251,113,133,0.08)", border: "1px solid rgba(251,113,133,0.35)",
            color: "var(--tm-danger)", fontSize: 11,
          }}>⨯ {s.skill}</span>
        ))}
      </div>

      {/* Actions row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        {missingSkills.length > 0 ? (
          <button
            onClick={onForge}
            style={{
              padding: "9px 18px", borderRadius: 99,
              background: "var(--tm-accent)", border: "none",
              color: "var(--tm-accent-fg)", fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
              boxShadow: "0 0 12px rgba(0,245,212,0.25)",
            }}
          >
            ▶ Forge: {firstGap}
          </button>
        ) : (
          <button
            style={{
              padding: "9px 18px", borderRadius: 99,
              background: "var(--tm-accent)", border: "none",
              color: "var(--tm-accent-fg)", fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            → Apply with tailored CV
          </button>
        )}
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
              <span style={{
                fontSize: 10, padding: "1px 6px", borderRadius: 4,
                background: "rgba(0,245,212,0.08)", border: "1px solid var(--tm-accent-ring)",
                color: "var(--tm-accent)", fontFamily: "var(--tm-font-mono)", letterSpacing: "0.06em",
              }}>LLM</span>
            </div>
            <p style={{
              margin: 0, fontSize: 13, color: "var(--tm-text-muted)", lineHeight: 1.65,
              paddingLeft: 12, borderLeft: "2px solid var(--tm-accent)",
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
                <span style={{
                  fontFamily: "var(--tm-font-mono)", fontSize: 10, padding: "1px 6px", borderRadius: 4,
                  background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)",
                  color: "var(--tm-success)",
                }}>{matchedSkills.length}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {[...matchedSkills].sort((a, b) => (b.user_level ?? 0) - (a.user_level ?? 0)).map(s => (
                  <SkillRow key={s.skill} skill={s} inCart={false} onToggle={() => {}} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
