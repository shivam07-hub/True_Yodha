"use client"

import { SkillRow } from "./SkillRow"
import type { JobMatch, ApplicationStatus, SkillGapItem, SkillGapResponse } from "@/lib/api"

const STATUS_OPTIONS: { value: ApplicationStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "applied", label: "Applied" },
  { value: "no_response", label: "No response" },
  { value: "responded", label: "Responded" },
  { value: "interviewing", label: "Interviewing" },
  { value: "rejected", label: "Rejected" },
  { value: "offer", label: "Offer 🎉" },
  { value: "abandoned", label: "Abandoned" },
]

function statusColor(s: ApplicationStatus): string {
  if (s === "applied" || s === "responded") return "var(--tm-accent)"
  if (s === "interviewing" || s === "offer") return "var(--tm-success)"
  if (s === "rejected" || s === "abandoned") return "var(--tm-danger)"
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
  expanded: boolean
  onToggle: () => void
  onStatus: (s: ApplicationStatus) => void
  cartSkillNames: Set<string>
  onSkillToggle: (skill: SkillGapItem) => void
  onForge: () => void
}

export function HeroCard({ job, status, skillGapData, expanded, onToggle, onStatus, cartSkillNames, onSkillToggle, onForge }: HeroCardProps) {
  const fit = Math.min(100, Math.round(job.overlap_score))
  const color = fitColor(fit)

  const missingSkills = skillGapData?.skills.filter(s => s.missing) ?? []
  const matchedSkills = skillGapData?.skills.filter(s => !s.missing) ?? []
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
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{
              margin: 0, fontSize: 26, fontWeight: 600,
              letterSpacing: "-0.02em", color: "var(--tm-text)", lineHeight: 1.15,
            }}>
              {job.title}
            </h2>
            <select
              value={status}
              onChange={(e) => onStatus(e.target.value as ApplicationStatus)}
              style={{
                fontSize: 12, fontWeight: 600, color: statusColor(status),
                background: "transparent", border: "none", cursor: "pointer",
                fontFamily: "inherit", padding: 0, outline: "none",
              }}
            >
              {STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value} style={{ background: "var(--tm-surface-2)", color: "var(--tm-text)" }}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{
            fontFamily: "var(--tm-font-mono)", fontSize: 11,
            color: "var(--tm-text-faint)", marginTop: 5,
          }}>
            {[job.company, job.location].filter(Boolean).join(" · ")}
            {job.llm_rank != null && ` · RANK · #${job.llm_rank}`}
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
        <button
          onClick={onToggle}
          style={{
            padding: "8px 14px", borderRadius: 99, cursor: "pointer",
            background: "transparent", border: "1px solid var(--tm-border)",
            color: "var(--tm-text-muted)", fontSize: 11.5,
            fontFamily: "var(--tm-font-mono)", fontWeight: 500,
            transition: "border-color 120ms var(--tm-ease)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--tm-accent-ring)" }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--tm-border)" }}
        >
          {expanded ? "▾ Collapse" : "▾ Expand detail"}
        </button>
        {job.source_url && (
          <a
            href={job.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11.5, color: "var(--tm-text-muted)", fontFamily: "var(--tm-font-mono)", textDecoration: "none" }}
          >
            JD ↗
          </a>
        )}
      </div>

      {/* Expanded block */}
      {expanded && (
        <div style={{ borderTop: "1px dashed var(--tm-border)", marginTop: 6, paddingTop: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>

            {/* Left: Why this is a good fit */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--tm-text)" }}>Why this is a good fit</span>
                <span style={{
                  fontSize: 10, padding: "2px 7px", borderRadius: 99,
                  background: "rgba(0,245,212,0.08)", border: "1px solid var(--tm-accent-ring)",
                  color: "var(--tm-accent)", fontFamily: "var(--tm-font-mono)", letterSpacing: "0.06em",
                }}>LLM</span>
              </div>
              <div style={{
                padding: "14px 16px", background: "rgba(0,245,212,0.03)",
                border: "1px solid var(--tm-accent-ring)", borderRadius: 8, position: "relative",
              }}>
                <div style={{
                  position: "absolute", left: 0, top: 12, bottom: 12, width: 2,
                  background: "var(--tm-accent)",
                  boxShadow: "0 0 6px var(--tm-accent-glow)",
                  borderRadius: "0 99px 99px 0",
                }} />
                {job.llm_explanation ? (
                  <p style={{ margin: 0, fontSize: 12.5, color: "var(--tm-text-muted)", lineHeight: 1.6 }}>
                    {job.llm_explanation}
                  </p>
                ) : (
                  <p style={{ margin: 0, fontSize: 12.5, color: "var(--tm-text-faint)", fontStyle: "italic" }}>
                    No explanation available.
                  </p>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
                <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--tm-text-faint)" }}>
                  Job ID
                </span>
                <span style={{
                  fontFamily: "var(--tm-font-mono)", fontSize: 11,
                  padding: "2px 8px", borderRadius: 4,
                  border: "1px dashed var(--tm-border)", color: "var(--tm-text-muted)",
                  cursor: "copy",
                }}>
                  {job.job_id}
                </span>
                {job.source_url && (
                  <a
                    href={job.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 11.5, color: "var(--tm-text-muted)", textDecoration: "none" }}
                  >
                    Open JD ↗
                  </a>
                )}
              </div>
            </div>

            {/* Right: Skill gaps + matches */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--tm-danger)" }}>Skill gaps to close</span>
                  <span style={{
                    fontFamily: "var(--tm-font-mono)", fontSize: 10, padding: "2px 7px", borderRadius: 99,
                    background: "rgba(251,113,133,0.08)", border: "1px solid rgba(251,113,133,0.25)",
                    color: "var(--tm-danger)",
                  }}>
                    {skillGapData?.missing_count ?? 0} of {skillGapData?.total_required ?? 0}
                  </span>
                </div>
                {missingSkills.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--tm-text-faint)", fontStyle: "italic" }}>
                    No gaps identified. Apply with confidence.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {missingSkills.map(s => (
                      <SkillRow key={s.skill} skill={s} inCart={cartSkillNames.has(s.skill)} onToggle={() => onSkillToggle(s)} />
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--tm-success)" }}>Skills you already match</span>
                  <span style={{
                    fontFamily: "var(--tm-font-mono)", fontSize: 10, padding: "2px 7px", borderRadius: 99,
                    background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)",
                    color: "var(--tm-success)",
                  }}>
                    {matchedSkills.length}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[...matchedSkills].sort((a, b) => (b.user_level ?? 0) - (a.user_level ?? 0)).map(s => (
                    <SkillRow key={s.skill} skill={s} inCart={false} onToggle={() => {}} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
