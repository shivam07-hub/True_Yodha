"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AppShell } from "@/components/app-shell"
import { CVRequiredNudge } from "@/components/common/cv-required-nudge"
import {
  jobs,
  scores,
  type ApplicationResponse,
  type ApplicationStatus,
  type JobPathMilestone,
  type JobPathResponse,
  type JobMatch,
  type JobComputeStatusResponse,
  type SkillGapItem,
  type UserSkillDemandItem,
} from "@/lib/api"
import { useAuth } from "@/lib/hooks/use-auth"
import {
  buildDiarySelectionsHref,
  toggleDiarySelection,
  type DiarySkillSelection,
} from "@/lib/diary-skill-cart"
import { dataKeys, invalidateJobData, invalidateJobPathData } from "@/lib/domain-data"

function JobDetailModal({ job, onClose }: { job: JobMatch; onClose: () => void }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative", zIndex: 1,
          width: "min(560px, 92vw)", maxHeight: "80vh",
          background: "var(--tm-surface)",
          border: "1px solid var(--tm-border)",
          borderRadius: "var(--tm-radius)",
          padding: "24px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          display: "flex", flexDirection: "column", gap: 14,
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)", marginBottom: 4 }}>{job.title}</div>
            <div style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>
              {[job.company, job.location].filter(Boolean).join(" · ")}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "1px solid var(--tm-border-soft)", borderRadius: 6, color: "var(--tm-text-muted)", cursor: "pointer", padding: "3px 8px", fontSize: 12, fontFamily: "inherit", flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "6px 12px", fontSize: 13 }}>
          <span style={{ color: "var(--tm-text-faint)", fontFamily: "monospace" }}>Job ID</span>
          <span style={{ color: "var(--tm-text-muted)", fontFamily: "monospace", wordBreak: "break-all" }}>{job.job_id}</span>
          <span style={{ color: "var(--tm-text-faint)", fontFamily: "monospace" }}>Job Title</span>
          <span style={{ color: "var(--tm-text)" }}>{job.title}</span>
        </div>
        {job.job_description && (
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 8 }}>Job Description</div>
            <div style={{ fontSize: 13, color: "var(--tm-text-muted)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{job.job_description}</div>
          </div>
        )}
        {!job.job_description && (
          <div style={{ fontSize: 13, color: "var(--tm-text-faint)", fontStyle: "italic" }}>No description available for this role.</div>
        )}
      </div>
    </div>
  )
}


function AppDetailModal({ app, onClose }: { app: ApplicationResponse; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", zIndex: 1, width: "min(560px, 92vw)", maxHeight: "80vh", background: "var(--tm-surface)", border: "1px solid var(--tm-border)", borderRadius: "var(--tm-radius)", padding: "24px", boxShadow: "0 24px 64px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)", marginBottom: 4 }}>{app.title}</div>
            <div style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>{app.company ?? ""}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "1px solid var(--tm-border-soft)", borderRadius: 6, color: "var(--tm-text-muted)", cursor: "pointer", padding: "3px 8px", fontSize: 12, fontFamily: "inherit", flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "6px 12px", fontSize: 13 }}>
          <span style={{ color: "var(--tm-text-faint)", fontFamily: "monospace" }}>Job ID</span>
          <span style={{ color: "var(--tm-text-muted)", fontFamily: "monospace", wordBreak: "break-all" }}>{app.job_id}</span>
          <span style={{ color: "var(--tm-text-faint)", fontFamily: "monospace" }}>Job Title</span>
          <span style={{ color: "var(--tm-text)" }}>{app.title}</span>
        </div>
        {app.job_description ? (
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 8 }}>Job Description</div>
            <div style={{ fontSize: 13, color: "var(--tm-text-muted)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{app.job_description}</div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "var(--tm-text-faint)", fontStyle: "italic" }}>No description available for this role.</div>
        )}
      </div>
    </div>
  )
}

const STATUSES: ApplicationStatus[] = ["pending", "applied", "no_response", "responded", "interviewing", "rejected", "offer", "abandoned"]

const STATUS_META: Record<ApplicationStatus, { label: string; fg: string; bg: string; border: string }> = {
  pending:      { label: "Pending",      fg: "var(--tm-accent)",   bg: "var(--tm-accent-wash)",   border: "rgba(0,245,212,0.2)" },
  applied:      { label: "Applied",      fg: "var(--tm-accent)",   bg: "var(--tm-accent-wash)",   border: "rgba(0,245,212,0.2)" },
  no_response:  { label: "No response",  fg: "var(--tm-warning)",  bg: "var(--tm-warning-wash)",  border: "rgba(245,158,11,0.2)" },
  responded:    { label: "Responded",    fg: "var(--tm-accent)",   bg: "var(--tm-accent-wash)",   border: "rgba(0,245,212,0.2)" },
  interviewing: { label: "Interviewing", fg: "var(--tm-success)",  bg: "var(--tm-success-wash)",  border: "rgba(74,222,128,0.2)" },
  rejected:     { label: "Rejected",     fg: "var(--tm-danger)",   bg: "var(--tm-danger-wash)",   border: "rgba(251,113,133,0.2)" },
  offer:        { label: "Offer 🎉",     fg: "var(--tm-success)",  bg: "var(--tm-success-wash)",  border: "rgba(74,222,128,0.3)" },
  abandoned:    { label: "Abandoned",    fg: "var(--tm-text-faint)", bg: "rgba(255,255,255,0.03)", border: "var(--tm-border-soft)" },
}

function RemoveJobButton({ label, removing, onRemove }: {
  label: string
  removing: boolean
  onRemove: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={removing}
      onClick={(e) => {
        e.stopPropagation()
        onRemove()
      }}
      style={{
        width: 28,
        height: 28,
        borderRadius: 999,
        border: "1px solid var(--tm-border-soft)",
        background: "rgba(255,255,255,0.03)",
        color: "var(--tm-text-faint)",
        cursor: removing ? "not-allowed" : "pointer",
        fontSize: 14,
        lineHeight: 1,
        fontFamily: "inherit",
        opacity: removing ? 0.45 : 1,
        transition: "color 0.15s, border-color 0.15s, background 0.15s",
      }}
      onMouseEnter={(e) => {
        if (removing) return
        e.currentTarget.style.color = "var(--tm-danger)"
        e.currentTarget.style.borderColor = "rgba(251,113,133,0.35)"
        e.currentTarget.style.background = "var(--tm-danger-wash)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--tm-text-faint)"
        e.currentTarget.style.borderColor = "var(--tm-border-soft)"
        e.currentTarget.style.background = "rgba(255,255,255,0.03)"
      }}
    >
      ×
    </button>
  )
}

function MarketTrackedCard({ app, updating, removing, onStatusChange, onDetailClick, onRemove, onSelect }: {
  app: ApplicationResponse; updating: boolean
  removing: boolean
  onStatusChange: (s: ApplicationStatus) => void; onDetailClick: () => void
  onRemove: () => void
  onSelect: (jobId: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const statusMeta = STATUS_META[app.status]
  return (
    <div
      onClick={() => {
        const next = !open
        setOpen(next)
        onSelect(next ? app.job_id : null)
      }}
      style={{
        borderRadius: "var(--tm-radius)", padding: "18px 20px",
        background: open ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.02)",
        border: open ? "1px solid var(--tm-accent-ring)" : "1px solid var(--tm-border-soft)",
        backdropFilter: "blur(20px)", cursor: "pointer",
        transition: "all var(--tm-dur) var(--tm-ease)",
        transform: open ? "translateY(-2px)" : "none",
        boxShadow: open ? "var(--tm-shadow-2)" : "none",
      }}
      onMouseEnter={(e) => { if (!open) e.currentTarget.style.borderColor = "var(--tm-border)" }}
      onMouseLeave={(e) => { if (!open) e.currentTarget.style.borderColor = "var(--tm-border-soft)" }}
    >
      {/* Header row — matches JobCard layout exactly */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div
            onClick={(e) => { e.stopPropagation(); onDetailClick() }}
            style={{ fontSize: 15, fontWeight: 600, color: "var(--tm-text)", marginBottom: 3, cursor: "pointer", display: "inline-block", borderBottom: "1px solid transparent", transition: "color 0.15s, border-color 0.15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--tm-accent)"; e.currentTarget.style.borderBottomColor = "var(--tm-accent-ring)" }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--tm-text)"; e.currentTarget.style.borderBottomColor = "transparent" }}
          >{app.title}</div>
          <div style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>{app.company ?? ""}</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexShrink: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
            <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-muted)", padding: "3px 8px", borderRadius: 999, background: "rgba(255,255,255,0.04)", border: "1px solid var(--tm-border-soft)" }}>
              Tracked from Market
            </div>
            <div style={{ fontSize: 11, color: statusMeta.fg, padding: "2px 7px", borderRadius: 999, background: statusMeta.bg, border: `1px solid ${statusMeta.border}` }}>
              {statusMeta.label}
            </div>
          </div>
          <RemoveJobButton label={`Remove ${app.title} from tracker`} removing={removing} onRemove={onRemove} />
        </div>
      </div>

      {/* Faint bar placeholder — visual parity with ScoreBar */}
      <div style={{ height: 3, borderRadius: 999, background: "var(--tm-border-soft)" }} />

      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--tm-border-soft)" }} onClick={(e) => e.stopPropagation()}>
          <select
            value={app.status}
            disabled={updating}
            onChange={(e) => onStatusChange(e.target.value as ApplicationStatus)}
            style={{ flex: 1, width: "100%", padding: "8px 12px", borderRadius: "var(--tm-radius-sm)", background: "var(--tm-surface-2)", border: "1px solid var(--tm-border)", color: "var(--tm-text)", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s} style={{ background: "var(--tm-surface)" }}>{STATUS_META[s].label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 75 ? "var(--tm-accent)" : score >= 55 ? "var(--tm-warning)" : "var(--tm-danger)"
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, height: 3, borderRadius: 999, background: "var(--tm-border-soft)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${score}%`, borderRadius: 999, background: color, transition: "width 1s var(--tm-ease)" }} />
      </div>
      <span style={{ fontSize: 14, fontWeight: 700, color, minWidth: 34, textAlign: "right" }}>{score}%</span>
    </div>
  )
}

function JobCard({
  job, status, tracked, updating,
  removing, onStatusChange, onDetailClick, onSelect, onRemove,
}: {
  job: JobMatch; status: ApplicationStatus; tracked: boolean; updating: boolean
  removing: boolean
  onStatusChange: (s: ApplicationStatus) => void; onDetailClick: () => void
  onSelect: (jobId: string | null) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const score = Math.min(100, Math.max(0, Math.round(job.overlap_score)))
  const firstPlan = job.action_plan?.[0]
  const statusMeta = STATUS_META[status]

  return (
    <div
      onClick={() => {
        const next = !open
        setOpen(next)
        onSelect(next ? job.job_id : null)
      }}
      style={{
        borderRadius: "var(--tm-radius)",
        padding: "18px 20px",
        background: open ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.02)",
        border: open ? "1px solid var(--tm-accent-ring)" : "1px solid var(--tm-border-soft)",
        backdropFilter: "blur(20px)",
        transition: "all var(--tm-dur) var(--tm-ease)",
        transform: open ? "translateY(-2px)" : "none",
        boxShadow: open ? "var(--tm-shadow-2)" : "none",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => { if (!open) e.currentTarget.style.borderColor = "var(--tm-border)" }}
      onMouseLeave={(e) => { if (!open) e.currentTarget.style.borderColor = "var(--tm-border-soft)" }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div
            onClick={(e) => { e.stopPropagation(); onDetailClick() }}
            style={{
              fontSize: 15, fontWeight: 600, color: "var(--tm-text)", marginBottom: 3,
              cursor: "pointer", display: "inline-block",
              borderBottom: "1px solid transparent",
              transition: "color 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--tm-accent)"; e.currentTarget.style.borderBottomColor = "var(--tm-accent-ring)" }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--tm-text)"; e.currentTarget.style.borderBottomColor = "transparent" }}
          >
            {job.title}
          </div>
          <div style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>
            {[job.company, job.location, job.remote ? "Remote" : null].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            {tracked ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                <div style={{
                  fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase",
                  color: "var(--tm-accent)", padding: "3px 8px", borderRadius: 999,
                  background: "var(--tm-accent-wash)", border: "1px solid var(--tm-accent-ring)",
                }}>
                  Tracking
                </div>
                <div style={{
                  fontSize: 11, color: statusMeta.fg, padding: "2px 7px", borderRadius: 999,
                  background: statusMeta.bg, border: `1px solid ${statusMeta.border}`,
                }}>
                  {statusMeta.label}
                </div>
              </div>
            ) : job.llm_rank ? (
              <div style={{ fontSize: 11, color: "var(--tm-text-faint)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                Rank #{job.llm_rank}
              </div>
            ) : null}
          </div>
          <RemoveJobButton label={`Remove ${job.title} from tracker`} removing={removing} onRemove={onRemove} />
        </div>
      </div>

      <ScoreBar score={score} />

      {/* Tags */}
      {job.matched_skills?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 12 }}>
          {job.matched_skills.slice(0, 5).map((t) => (
            <span key={t} style={{
              fontSize: 11, padding: "3px 8px", borderRadius: 999,
              background: "var(--tm-accent-wash)",
              border: "1px solid var(--tm-border-soft)",
              color: "var(--tm-accent)",
            }}>
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Expanded */}
      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--tm-border-soft)" }}>
          {job.llm_explanation ? (
            <div style={{
              padding: "12px 14px", borderRadius: "var(--tm-radius-sm)",
              background: "var(--tm-accent-wash)",
              border: "1px solid var(--tm-accent-ring)",
              marginBottom: 12,
            }}>
              <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-accent)", fontWeight: 600, marginBottom: 6 }}>
                Why this is a good fit
              </div>
              <p style={{ fontSize: 13, color: "var(--tm-text-muted)", lineHeight: 1.65, margin: 0 }}>
                {job.llm_explanation}
              </p>
            </div>
          ) : null}
          {firstPlan && (
            <div style={{
              padding: "10px 14px", borderRadius: "var(--tm-radius-sm)",
              background: "var(--tm-accent-wash)",
              border: "1px solid var(--tm-border-soft)",
              fontSize: 13, color: "var(--tm-accent)", marginBottom: 14,
            }}>
              ⚡ Next: {firstPlan.focus}
            </div>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--tm-border-soft)" }} onClick={(e) => e.stopPropagation()}>
        <select
          aria-label={`Application status for ${job.title}`}
          value={status}
          disabled={updating}
          onChange={(e) => onStatusChange(e.target.value as ApplicationStatus)}
          style={{
            flex: "1 1 220px", maxWidth: 320, padding: "8px 12px", borderRadius: "var(--tm-radius-sm)",
            background: "var(--tm-surface-2)",
            border: "1px solid var(--tm-border)",
            color: "var(--tm-text)", fontSize: 13, fontFamily: "inherit", cursor: updating ? "not-allowed" : "pointer",
          }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s} style={{ background: "var(--tm-surface)" }}>{STATUS_META[s].label}</option>
          ))}
        </select>
        {job.source_url && (
          <a
            href={job.source_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              padding: "8px 16px", borderRadius: "var(--tm-radius-sm)",
              border: "1px solid var(--tm-border)",
              background: "transparent",
              color: "var(--tm-text-muted)", fontSize: 13, textDecoration: "none", flexShrink: 0, marginLeft: "auto",
            }}
          >
            Open JD ↗
          </a>
        )}
      </div>
    </div>
  )
}

function skillSelectionKey(skill: string): string {
  return skill.trim().toLowerCase()
}

function buildGapSkillSelection(skill: SkillGapItem): DiarySkillSelection {
  return {
    skill: skill.skill,
    intent: skill.missing ? "add" : "upgrade",
    ...(typeof skill.user_level === "number" ? { level: skill.user_level } : {}),
    source: "job-gap",
  }
}

function buildDemandSkillSelection(skill: UserSkillDemandItem): DiarySkillSelection {
  return {
    skill: skill.display_name,
    intent: "upgrade",
    ...(typeof skill.current_level === "number" ? { level: skill.current_level } : {}),
    source: "skill-demand",
  }
}

function SkillActionButton({
  label,
  queued,
  onClick,
  ariaLabel,
}: {
  label: string
  queued: boolean
  onClick: () => void
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={queued}
      onClick={onClick}
      className={`tm-btn ${queued ? "tm-btn-primary" : "tm-btn-ghost"}`}
      style={{ height: 32, padding: "0 12px", fontSize: 11, whiteSpace: "nowrap", justifyContent: "center" }}
    >
      {queued ? "Queued" : label}
    </button>
  )
}

function DiaryCartPanel({
  selections,
  onRemove,
  onClear,
}: {
  selections: DiarySkillSelection[]
  onRemove: (selection: DiarySkillSelection) => void
  onClear: () => void
}) {
  const href = buildDiarySelectionsHref(selections)

  return (
    <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)", padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-accent)" }}>
          Diary Cart
        </div>
        <div style={{
          fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
          color: selections.length > 0 ? "var(--tm-accent)" : "var(--tm-text-faint)",
          background: selections.length > 0 ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.03)",
          border: `1px solid ${selections.length > 0 ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
        }}>
          {selections.length} queued
        </div>
      </div>

      {selections.length === 0 ? (
        <div style={{
          padding: "14px 16px", borderRadius: "var(--tm-radius-sm)",
          background: "rgba(255,255,255,0.02)", border: "1px solid var(--tm-border-soft)",
          fontSize: 12, lineHeight: 1.6, color: "var(--tm-text-faint)",
        }}>
          Tap <span style={{ color: "var(--tm-text)" }}>Add</span> or <span style={{ color: "var(--tm-text)" }}>Upgrade</span> on any skill below to queue it here, then send everything to the diary together.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {selections.map((selection) => (
              <div
                key={skillSelectionKey(selection.skill)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                  padding: "10px 12px", borderRadius: "var(--tm-radius-sm)",
                  background: "rgba(255,255,255,0.02)", border: "1px solid var(--tm-border-soft)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "var(--tm-text)" }}>{selection.skill}</div>
                  <div style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>
                    {selection.intent === "add"
                      ? "New skill"
                      : selection.level
                        ? `Upgrade from L${selection.level}`
                        : "Upgrade"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(selection)}
                  className="tm-btn tm-btn-ghost"
                  style={{ height: 30, padding: "0 10px", fontSize: 11, flexShrink: 0 }}
                  aria-label={`Remove ${selection.skill} from diary cart`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <a
              href={href}
              className="tm-btn tm-btn-primary"
              style={{ flex: 1, justifyContent: "center", textDecoration: "none" }}
            >
              Send {selections.length === 1 ? "1 skill" : `${selections.length} skills`} to diary
            </a>
            <button
              type="button"
              onClick={onClear}
              className="tm-btn tm-btn-ghost"
              style={{ height: 36, fontSize: 12 }}
            >
              Clear
            </button>
          </div>

          <div style={{ fontSize: 11, color: "var(--tm-text-faint)", marginTop: 8 }}>
            Keep adding skills until the cart feels complete, then send them in one note.
          </div>
        </>
      )}
    </div>
  )
}

function CVSkillDemandCard({
  skill,
  queued,
  onToggle,
}: {
  skill: UserSkillDemandItem
  queued: boolean
  onToggle: (selection: DiarySkillSelection) => void
}) {
  const demandColor =
    skill.job_count_30d >= 250 ? "var(--tm-accent)" :
    skill.job_count_30d >= 100 ? "var(--tm-warning)" :
    "var(--tm-text-faint)"
  const selection = buildDemandSkillSelection(skill)

  return (
    <div style={{
      padding: "12px 16px", borderRadius: "var(--tm-radius-sm)",
      background: queued ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.02)",
      border: queued ? "1px solid var(--tm-accent-ring)" : "1px solid var(--tm-border-soft)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 14, color: "var(--tm-text)", marginBottom: 2 }}>{skill.display_name}</div>
          <div style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>
            L{skill.current_level} · {skill.proficiency_title}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 11, color: demandColor }}>
          {skill.job_count_30d.toLocaleString()} jobs for this skill
        </div>
        <SkillActionButton
          label="Upgrade"
          queued={queued}
          onClick={() => onToggle(selection)}
          ariaLabel={`${queued ? "Remove" : "Upgrade"} ${skill.display_name} in diary cart`}
        />
      </div>
    </div>
  )
}

function JobSkillGapPanel({
  skills,
  targetSkillKeys,
  onToggle,
}: {
  skills: SkillGapItem[]
  targetSkillKeys: Set<string>
  onToggle: (selection: DiarySkillSelection) => void
}) {
  const missing = skills.filter((s) => s.missing)
  const matched = skills.filter((s) => !s.missing)
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {missing.length > 0 && (
        <>
          <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-danger)", marginBottom: 2 }}>
            Missing · {missing.length}
          </div>
          {missing.map((s) => {
            const selection = buildGapSkillSelection(s)
            const queued = targetSkillKeys.has(skillSelectionKey(s.skill))

            return (
              <div
                key={s.skill}
                style={{
                  padding: "9px 12px", borderRadius: "var(--tm-radius-sm)",
                  background: queued ? "rgba(0,245,212,0.08)" : "var(--tm-danger-wash)",
                  border: queued ? "1px solid var(--tm-accent-ring)" : "1px solid rgba(251,113,133,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "var(--tm-text)" }}>{s.skill}</div>
                  <div style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>
                    {s.is_primary ? "Required for this role" : "Nice to have"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <a
                    href={`/diary?skill=${encodeURIComponent(s.skill)}`}
                    style={{
                      fontSize: 11, padding: "3px 8px", borderRadius: 6, fontWeight: 600,
                      background: "rgba(0,245,212,0.08)", border: "1px solid var(--tm-accent-ring)",
                      color: "var(--tm-accent)", textDecoration: "none",
                    }}
                  >
                    Forge →
                  </a>
                  <SkillActionButton
                    label="Target"
                    queued={queued}
                    onClick={() => onToggle(selection)}
                    ariaLabel={`${queued ? "Remove" : "Target"} ${s.skill} for this job`}
                  />
                </div>
              </div>
            )
          })}
        </>
      )}
      {matched.length > 0 && (
        <>
          <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-success)", marginTop: missing.length > 0 ? 8 : 0, marginBottom: 2 }}>
            You Have · {matched.length}
          </div>
          {matched.map((s) => {
            const selection = buildGapSkillSelection(s)
            const queued = targetSkillKeys.has(skillSelectionKey(s.skill))

            return (
              <div
                key={s.skill}
                style={{
                  padding: "9px 12px", borderRadius: "var(--tm-radius-sm)",
                  background: queued ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.02)",
                  border: queued ? "1px solid var(--tm-accent-ring)" : "1px solid var(--tm-border-soft)",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "var(--tm-text-muted)" }}>{s.skill}</div>
                  <div style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>
                    {typeof s.user_level === "number" ? `Current level · L${s.user_level}` : "Current skill"}
                  </div>
                </div>
                <SkillActionButton
                  label="Target"
                  queued={queued}
                  onClick={() => onToggle(selection)}
                  ariaLabel={`${queued ? "Remove" : "Target"} ${s.skill} for this job`}
                />
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

function proofCountCopy(count: number): string {
  if (count <= 0) return "No proof yet"
  if (count === 1) return "1 proof logged"
  return `${count} proofs logged`
}

function JobPathPanel({
  path,
  proof,
  impact,
  confidence,
  savingProof,
  generatingCv,
  generatedCvText,
  onProofChange,
  onImpactChange,
  onConfidenceChange,
  onSaveProof,
  onGenerateCv,
  onPolishCv,
  cvNotice,
}: {
  path: JobPathResponse
  proof: string
  impact: string
  confidence: number
  savingProof: boolean
  generatingCv: boolean
  generatedCvText: string | null
  onProofChange: (value: string) => void
  onImpactChange: (value: string) => void
  onConfidenceChange: (value: number) => void
  onSaveProof: (milestone: JobPathMilestone) => void
  onGenerateCv: () => void
  onPolishCv: () => void
  cvNotice: string | null
}) {
  const tierLabel = String(path.readiness_tier.label ?? "Readiness")
  const tierCopy = String(path.readiness_tier.microcopy ?? "")
  const today = path.today_milestone
  const totalProofs = path.target_skills.reduce((sum, target) => sum + target.proof_count, 0)
  const cvLabel = path.cv?.confidence?.badge_text ? String(path.cv.confidence.badge_text) : totalProofs >= 3 ? "Strong evidence" : totalProofs >= 1 ? "Proof-backed" : "Starter"

  return (
    <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)", padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div className="tm-label-caps" style={{ color: "var(--tm-accent)" }}>Job Path</div>
        <div style={{ fontSize: "var(--tm-fs-meta)", fontWeight: 700, color: "var(--tm-accent)" }}>
          {path.readiness_pct}% ready
        </div>
      </div>

      <div style={{ height: 3, borderRadius: 999, background: "var(--tm-border-soft)", overflow: "hidden", marginBottom: 10 }}>
        <div style={{ height: "100%", width: `${path.readiness_pct}%`, background: "var(--tm-accent)", borderRadius: 999 }} />
      </div>
      <div style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text)", marginBottom: 4 }}>{tierLabel}</div>
      <div style={{ fontSize: "var(--tm-fs-meta)", lineHeight: "var(--tm-lh-meta)", color: "var(--tm-text-faint)", marginBottom: 14 }}>{tierCopy}</div>

      <div className="tm-label-caps" style={{ marginBottom: 8 }}>Target Skills</div>
      {path.target_skills.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {path.target_skills.map((target) => (
            <span key={target.skill} className="tm-pill" style={{ border: "1px solid var(--tm-border-soft)" }}>
              {target.skill} · {proofCountCopy(target.proof_count)}
            </span>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-faint)", marginBottom: 14 }}>
          Pick one or many from the skill gap panel.
        </div>
      )}

      <div className="tm-label-caps" style={{ marginBottom: 8 }}>Today&apos;s Milestone</div>
      {today ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ padding: 12, borderRadius: "var(--tm-radius-sm)", background: "rgba(255,255,255,0.02)", border: "1px solid var(--tm-border-soft)" }}>
            <div style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text)", fontWeight: 600, marginBottom: 4 }}>{today.title}</div>
            <div style={{ fontSize: "var(--tm-fs-meta)", lineHeight: "var(--tm-lh-meta)", color: "var(--tm-text-muted)" }}>{today.action}</div>
          </div>
          {!today.completed_at ? (
            <>
              <textarea
                value={proof}
                onChange={(event) => onProofChange(event.target.value)}
                placeholder={today.proof_prompt ?? "Paste link, file path, or short note."}
                className="tm-input"
                style={{ minHeight: 74, resize: "vertical", fontSize: "var(--tm-fs-meta)", lineHeight: "var(--tm-lh-meta)" }}
              />
              <input
                value={impact}
                onChange={(event) => onImpactChange(event.target.value)}
                placeholder={today.impact_prompt ?? "One line: why this matters for the role."}
                className="tm-input"
                style={{ fontSize: "var(--tm-fs-meta)" }}
              />
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-faint)" }}>
                Confidence · {confidence}/5
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={confidence}
                  onChange={(event) => onConfidenceChange(Number(event.target.value))}
                />
              </label>
              <button
                type="button"
                onClick={() => onSaveProof(today)}
                disabled={!proof.trim() || savingProof}
                className="tm-btn tm-btn-primary"
                style={{ justifyContent: "center", opacity: !proof.trim() || savingProof ? 0.5 : 1 }}
              >
                {savingProof ? "Saving..." : "Save proof"}
              </button>
              <a
                href={`/diary?jobId=${encodeURIComponent(path.job_id)}&milestoneId=${encodeURIComponent(today.id)}`}
                className="tm-btn tm-btn-ghost"
                style={{ justifyContent: "center", textDecoration: "none", fontSize: "var(--tm-fs-meta)" }}
              >
                Open in diary
              </a>
            </>
          ) : (
            <div className="tm-pill" style={{ color: "var(--tm-accent)", border: "1px solid var(--tm-accent-ring)", background: "var(--tm-accent-wash)", alignSelf: "flex-start" }}>
              Done
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-faint)", marginBottom: 14 }}>
          Add a target skill and a rolling 7-day plan builds itself.
        </div>
      )}

      <div style={{ height: 1, background: "var(--tm-border-soft)", margin: "14px 0" }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div>
          <div className="tm-label-caps" style={{ marginBottom: 4 }}>CV</div>
          <div style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-faint)" }}>
            {path.cv ? cvLabel : "Starter CV is ready anytime."}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onGenerateCv}
            disabled={generatingCv}
            className="tm-btn tm-btn-ghost"
            style={{ height: 34, fontSize: "var(--tm-fs-meta)" }}
          >
            {generatingCv ? "..." : path.cv ? "Rebuild" : "Generate"}
          </button>
          <button
            type="button"
            onClick={onPolishCv}
            disabled={generatingCv}
            className="tm-btn tm-btn-ghost"
            style={{ height: 34, fontSize: "var(--tm-fs-meta)" }}
          >
            Polish
          </button>
        </div>
      </div>
      <a
        href={`/cv?jobId=${encodeURIComponent(path.job_id)}`}
        className="tm-btn tm-btn-ghost"
        style={{ justifyContent: "center", textDecoration: "none", fontSize: "var(--tm-fs-meta)", marginBottom: 10 }}
      >
        Open CV page
      </a>
      {generatedCvText && (
        <pre style={{
          maxHeight: 180,
          overflowY: "auto",
          whiteSpace: "pre-wrap",
          fontFamily: "var(--tm-font-mono)",
          fontSize: "var(--tm-fs-meta)",
          lineHeight: "var(--tm-lh-meta)",
          color: "var(--tm-text-muted)",
          border: "1px solid var(--tm-border-soft)",
          borderRadius: "var(--tm-radius-sm)",
          padding: 12,
          background: "rgba(255,255,255,0.02)",
        }}>
          {generatedCvText}
        </pre>
      )}
      {cvNotice && (
        <div style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-faint)", marginTop: generatedCvText ? 8 : 0 }}>
          {cvNotice}
        </div>
      )}

      {path.follow_up && (
        <>
          <div style={{ height: 1, background: "var(--tm-border-soft)", margin: "14px 0" }} />
          <div className="tm-label-caps" style={{ marginBottom: 6 }}>Follow-up</div>
          <div style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text)", marginBottom: 4 }}>
            {String(path.follow_up.header ?? "")}
          </div>
          <div style={{ fontSize: "var(--tm-fs-meta)", lineHeight: "var(--tm-lh-meta)", color: "var(--tm-text-faint)" }}>
            {String(path.follow_up.microcopy ?? "")}
          </div>
        </>
      )}
    </div>
  )
}

export default function TrackerPage() {
  const { token, ready } = useAuth()
  const queryClient = useQueryClient()
  const computeStreamAbortRef = useRef<AbortController | null>(null)
  const [diarySelections, setDiarySelections] = useState<DiarySkillSelection[]>([])
  const [proofText, setProofText] = useState("")
  const [impactText, setImpactText] = useState("")
  const [confidence, setConfidence] = useState(3)
  const [generatedCvText, setGeneratedCvText] = useState<string | null>(null)
  const [cvNotice, setCvNotice] = useState<string | null>(null)
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null)
  const [isRefreshingMatches, setIsRefreshingMatches] = useState(false)

  const matchesQuery = useQuery({
    queryKey: dataKeys.jobs(),
    queryFn: () => jobs.matches(token!),
    enabled: !!token,
  })

  const appsQuery = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobs.applications(token!),
    enabled: !!token,
  })

  const scoresQuery = useQuery({
    queryKey: dataKeys.scores(),
    queryFn: () => scores.me(token!),
    enabled: !!token,
  })

  const hasCv = !scoresQuery.isLoading && !!scoresQuery.data

  const skillDemandQuery = useQuery({
    queryKey: dataKeys.userSkillDemand(),
    queryFn: () => jobs.mySkillDemand(token!),
    enabled: !!token,
  })

  function stopComputeStream(): void {
    computeStreamAbortRef.current?.abort()
    computeStreamAbortRef.current = null
  }

  function applyComputeStatus(statusPayload: JobComputeStatusResponse): void {
    if (statusPayload.status === "queued") {
      setIsRefreshingMatches(true)
      setRefreshNotice(statusPayload.message || "Refresh queued. We’ll update this list shortly.")
      return
    }
    if (statusPayload.status === "running") {
      setIsRefreshingMatches(true)
      setRefreshNotice(statusPayload.message || "Refreshing matches in the background…")
      return
    }
    if (statusPayload.status === "failed") {
      setIsRefreshingMatches(false)
      setRefreshNotice(statusPayload.error || "Refresh failed. Please try again.")
      stopComputeStream()
      return
    }
    if (statusPayload.status === "succeeded") {
      setIsRefreshingMatches(false)
      if (statusPayload.from_cache) {
        setRefreshNotice("Using this week’s cached matches.")
      } else if ((statusPayload.matches_written ?? 0) > 0) {
        setRefreshNotice(`Updated ${statusPayload.matches_written ?? 0} matched roles.`)
      } else if (statusPayload.needs_onboarding) {
        setRefreshNotice("Upload your CV first to generate role matches.")
      } else {
        const debug = statusPayload.debug as {
          user_skills_count?: number | null
          candidate_jobs_count?: number | null
          top_jobs_count?: number | null
        } | null
        if (debug) {
          const skills = debug.user_skills_count ?? 0
          const candidates = debug.candidate_jobs_count ?? 0
          const ranked = debug.top_jobs_count ?? 0
          setRefreshNotice(`No matches generated (skills=${skills}, candidates=${candidates}, ranked=${ranked}). Try updating target roles in Intel, then refresh.`)
        } else {
          setRefreshNotice("No match set generated. Try updating target roles in Intel, then refresh.")
        }
      }
      queryClient.invalidateQueries({ queryKey: dataKeys.jobs() })
      stopComputeStream()
      return
    }
    if (statusPayload.status === "idle") {
      setIsRefreshingMatches(false)
      stopComputeStream()
    }
  }

  async function startComputeStatusStream(): Promise<void> {
    if (!token) return
    stopComputeStream()
    const controller = new AbortController()
    computeStreamAbortRef.current = controller
    try {
      await jobs.computeStatusStream(token, (statusPayload) => {
        applyComputeStatus(statusPayload)
      }, controller.signal)
    } catch (error) {
      if (controller.signal.aborted) return
      setIsRefreshingMatches(false)
      setRefreshNotice((error as Error).message || "Could not receive refresh progress updates.")
      stopComputeStream()
    }
  }

  const refreshMatches = useMutation({
    mutationFn: () => jobs.compute(token!),
    onSuccess: (payload) => {
      if (payload.status === "queued" || payload.status === "running" || payload.already_running) {
        setIsRefreshingMatches(true)
        setRefreshNotice(payload.message || "Refreshing matches in the background…")
        void startComputeStatusStream()
        return
      }
      // Backward-compatible fallback for sync/legacy responses.
      applyComputeStatus({
        user_id: "current",
        batch_week: payload.batch_week,
        status: "succeeded",
        job_id: payload.job_id ?? null,
        already_running: !!payload.already_running,
        matches_written: payload.matches_written,
        from_cache: payload.from_cache,
        needs_onboarding: payload.needs_onboarding ?? false,
        debug: payload.debug ?? null,
        message: payload.message ?? null,
        error: null,
        enqueued_at: null,
        started_at: null,
        finished_at: null,
      })
    },
    onError: () => {
      setIsRefreshingMatches(false)
      setRefreshNotice("Refresh failed. Please try again.")
    },
  })

  const updateStatus = useMutation({
    mutationFn: ({ jobId, status }: { jobId: string; status: ApplicationStatus }) =>
      jobs.updateApplication(token!, jobId, { status }),
    onSuccess: (_app, variables) => {
      queryClient.invalidateQueries({ queryKey: dataKeys.applications() })
      invalidateJobPathData(queryClient, variables.jobId)
    },
  })

  const [detailJob, setDetailJob] = useState<JobMatch | null>(null)
  const [appDetailJob, setAppDetailJob] = useState<ApplicationResponse | null>(null)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)

  const removeTrackerJob = useMutation({
    mutationFn: (jobId: string) => jobs.removeTrackerJob(token!, jobId),
    onSuccess: (_data, jobId) => {
      invalidateJobData(queryClient)
      setSelectedJobId((current) => (current === jobId ? null : current))
      setDetailJob((current) => (current?.job_id === jobId ? null : current))
      setAppDetailJob((current) => (current?.job_id === jobId ? null : current))
    },
  })

  const skillGapQuery = useQuery({
    queryKey: dataKeys.skillGap(selectedJobId),
    queryFn: () => jobs.skillGap(token!, selectedJobId!),
    enabled: !!token && !!selectedJobId,
  })

  const jobPathQuery = useQuery({
    queryKey: dataKeys.jobPath(selectedJobId),
    queryFn: () => jobs.path(token!, selectedJobId!),
    enabled: !!token && !!selectedJobId,
  })

  const updateTargets = useMutation({
    mutationFn: ({ jobId, targets }: { jobId: string; targets: Array<{ skill: string; is_primary?: boolean | null }> }) =>
      jobs.updateTargets(token!, jobId, targets),
    onSuccess: (_path, variables) => {
      invalidateJobPathData(queryClient, variables.jobId)
      queryClient.invalidateQueries({ queryKey: dataKeys.applications() })
    },
  })

  const saveMilestoneProof = useMutation({
    mutationFn: ({ jobId, milestoneId, proof, impact, confidence }: {
      jobId: string
      milestoneId: string
      proof: string
      impact: string
      confidence: number
    }) => jobs.updateMilestone(token!, jobId, milestoneId, {
      proof,
      impact: impact || null,
      confidence: confidence / 5,
      completed: true,
    }),
    onSuccess: (_milestone, variables) => {
      setProofText("")
      setImpactText("")
      invalidateJobPathData(queryClient, variables.jobId)
    },
  })

  const generateJobCv = useMutation({
    mutationFn: ({ jobId, aiPolish }: { jobId: string; aiPolish: boolean }) => jobs.generateJobCv(token!, jobId, aiPolish),
    onSuccess: (cv, variables) => {
      setGeneratedCvText(cv.polished_text ?? cv.cv_text)
      if (variables.aiPolish && cv.limit_reached) {
        setCvNotice("AI polish limit reached. Showing the best cached job CV.")
      } else if (variables.aiPolish && cv.polish_unavailable) {
        setCvNotice("Polish unavailable, using the proof-backed CV.")
      } else if (variables.aiPolish && cv.polished_text) {
        const remaining = Math.max(0, cv.ai_polish_limit - cv.ai_polish_used)
        setCvNotice(`Polished CV ready. ${remaining} polish calls left today.`)
      } else {
        setCvNotice("Job CV ready.")
      }
      invalidateJobPathData(queryClient, variables.jobId)
    },
  })

  useEffect(() => {
    setGeneratedCvText(null)
    setProofText("")
    setImpactText("")
    setConfidence(3)
    setCvNotice(null)
  }, [selectedJobId, jobPathQuery.data?.today_milestone?.id])

  useEffect(() => {
    return () => {
      computeStreamAbortRef.current?.abort()
      computeStreamAbortRef.current = null
    }
  }, [])

  const appsByJobId = useMemo(() => {
    const map: Record<string, { status: ApplicationStatus; appliedAt: string | null }> = {}
    for (const app of appsQuery.data ?? []) {
      map[app.job_id] = { status: app.status, appliedAt: app.applied_at }
    }
    return map
  }, [appsQuery.data])

  const topJobs = useMemo(() => {
    const all = matchesQuery.data?.jobs ?? []
    return [...all].sort((a, b) => {
      const aTracked = !!appsByJobId[a.job_id]
      const bTracked = !!appsByJobId[b.job_id]
      if (aTracked !== bTracked) return aTracked ? -1 : 1
      return (a.llm_rank ?? 99) - (b.llm_rank ?? 99)
    })
  }, [matchesQuery.data, appsByJobId])

  const matchedJobIds = useMemo(() => new Set((matchesQuery.data?.jobs ?? []).map((j) => j.job_id)), [matchesQuery.data])

  const marketTrackedJobs = useMemo(
    () => (appsQuery.data ?? []).filter((a) => !matchedJobIds.has(a.job_id)),
    [appsQuery.data, matchedJobIds],
  )

  const topDemandSkills = useMemo(() => (skillDemandQuery.data?.skills ?? []).slice(0, 6), [skillDemandQuery.data])
  const queuedSkillKeys = useMemo(
    () => new Set(diarySelections.map((selection) => skillSelectionKey(selection.skill))),
    [diarySelections],
  )
  const targetSkillKeys = useMemo(
    () => new Set((jobPathQuery.data?.target_skills ?? []).map((selection) => skillSelectionKey(selection.skill))),
    [jobPathQuery.data?.target_skills],
  )

  function handleDiaryToggle(selection: DiarySkillSelection) {
    setDiarySelections((current) => toggleDiarySelection(current, selection))
  }

  function handleTargetToggle(selection: DiarySkillSelection) {
    if (!selectedJobId) return
    const current = jobPathQuery.data?.target_skills ?? []
    const key = skillSelectionKey(selection.skill)
    const gapSkill = skillGapQuery.data?.skills.find((skill) => skillSelectionKey(skill.skill) === key)
    const exists = current.some((target) => skillSelectionKey(target.skill) === key)
    const next = exists
      ? current.filter((target) => skillSelectionKey(target.skill) !== key)
      : [...current, { skill: selection.skill, is_primary: gapSkill?.is_primary ?? selection.intent === "add", proof_count: 0 }]
    updateTargets.mutate({
      jobId: selectedJobId,
      targets: next.map((target) => ({ skill: target.skill, is_primary: target.is_primary })),
    })
    setDiarySelections((currentSelections) => toggleDiarySelection(currentSelections, selection))
  }

  if (!ready) return null

  return (
    <>
    {detailJob && <JobDetailModal job={detailJob} onClose={() => setDetailJob(null)} />}
    {appDetailJob && <AppDetailModal app={appDetailJob} onClose={() => setAppDetailJob(null)} />}
    <AppShell>
      <div className="tm-page-enter" style={{ padding: "var(--tm-page-py) var(--tm-page-px)", overflowY: "auto", height: "100%" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: "var(--tm-accent)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6, opacity: 0.7 }}>
            app/job_tracker
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
            <div>
              <h1 style={{ fontSize: "var(--tm-fs-title)", fontWeight: 600, color: "var(--tm-text)", letterSpacing: "var(--tm-tracking-tight)", marginBottom: 4 }}>
                Tracking Matched Jobs
              </h1>
              <p style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-faint)" }}>
                Top matches · sorted by skill alignment
              </p>
            </div>
            <button
              onClick={() => {
                setRefreshNotice(null)
                refreshMatches.mutate()
              }}
              disabled={refreshMatches.isPending || isRefreshingMatches}
              className="tm-btn tm-btn-ghost"
              style={{ opacity: refreshMatches.isPending || isRefreshingMatches ? 0.5 : 1 }}
            >
              {refreshMatches.isPending || isRefreshingMatches ? "…" : "⟳ Refresh"}
            </button>
          </div>
          {refreshNotice && (
            <div style={{ marginTop: 10, fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-faint)" }}>
              {refreshNotice}
            </div>
          )}
        </div>

        <CVRequiredNudge hasCv={hasCv} feature="your job matches" />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, alignItems: "start" }}>
          {/* Job cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Tracked from Market — top priority */}
            {marketTrackedJobs.length > 0 && (
              <>
                <div style={{ marginBottom: 4, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
                  Tracked from Market · {marketTrackedJobs.length}
                </div>
                {marketTrackedJobs.map((app) => (
                  <MarketTrackedCard
                    key={app.job_id}
                    app={app}
                    updating={updateStatus.isPending}
                    removing={removeTrackerJob.isPending && removeTrackerJob.variables === app.job_id}
                    onStatusChange={(status) => updateStatus.mutate({ jobId: app.job_id, status })}
                    onDetailClick={() => setAppDetailJob(app)}
                    onRemove={() => removeTrackerJob.mutate(app.job_id)}
                    onSelect={setSelectedJobId}
                  />
                ))}
                {topJobs.length > 0 && (
                  <div style={{ height: 1, background: "var(--tm-border-soft)", margin: "4px 0" }} />
                )}
              </>
            )}

            {/* AI matched jobs */}
            {matchesQuery.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ height: 100, borderRadius: "var(--tm-radius)", background: "rgba(255,255,255,0.02)", border: "1px solid var(--tm-border-soft)", animation: "pulse 2s infinite" }} />
              ))
            ) : topJobs.length === 0 && marketTrackedJobs.length === 0 ? (
              <div style={{
                padding: 48, textAlign: "center",
                borderRadius: "var(--tm-radius)",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid var(--tm-border-soft)",
              }}>
                <div style={{ fontSize: 33, marginBottom: 12, opacity: 0.2, color: "var(--tm-accent)" }}>◆</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)", marginBottom: 6 }}>No matches yet</div>
                <div style={{ fontSize: 14, color: "var(--tm-text-faint)" }}>
                  {hasCv
                    ? "No role matches generated yet. Click Refresh. If still empty, update target roles in Intel."
                    : "Upload your CV then click Refresh."}
                </div>
              </div>
            ) : (
              topJobs.map((job) => {
                const app = appsByJobId[job.job_id]
                return (
                  <JobCard
                    key={job.id}
                    job={job}
                    status={app?.status ?? "pending"}
                    tracked={!!app}
                    updating={updateStatus.isPending}
                    removing={removeTrackerJob.isPending && removeTrackerJob.variables === job.job_id}
                    onStatusChange={(status) => updateStatus.mutate({ jobId: job.job_id, status })}
                    onDetailClick={() => setDetailJob(job)}
                    onSelect={setSelectedJobId}
                    onRemove={() => removeTrackerJob.mutate(job.job_id)}
                  />
                )
              })
            )}
          </div>

          {/* Sidebar */}
          <div style={{ position: "sticky", top: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            <DiaryCartPanel
              selections={diarySelections}
              onRemove={handleDiaryToggle}
              onClear={() => setDiarySelections([])}
            />

            {selectedJobId && jobPathQuery.data && (
              <JobPathPanel
                path={jobPathQuery.data}
                proof={proofText}
                impact={impactText}
                confidence={confidence}
                savingProof={saveMilestoneProof.isPending}
                generatingCv={generateJobCv.isPending}
                generatedCvText={generatedCvText}
                onProofChange={setProofText}
                onImpactChange={setImpactText}
                onConfidenceChange={setConfidence}
                onSaveProof={(milestone) => {
                  if (!selectedJobId) return
                  saveMilestoneProof.mutate({
                    jobId: selectedJobId,
                    milestoneId: milestone.id,
                    proof: proofText,
                    impact: impactText,
                    confidence,
                  })
                }}
                onGenerateCv={() => selectedJobId && generateJobCv.mutate({ jobId: selectedJobId, aiPolish: false })}
                onPolishCv={() => selectedJobId && generateJobCv.mutate({ jobId: selectedJobId, aiPolish: true })}
                cvNotice={cvNotice}
              />
            )}

            <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)", padding: 20 }}>
              {selectedJobId ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div style={{ fontSize: 12, color: "var(--tm-accent)", fontWeight: 700, lineHeight: 1.4, paddingRight: 12, letterSpacing: "0.04em" }}>
                      ◑ Skill Forge Bucket
                    </div>
                    {skillGapQuery.data && (
                      <div style={{
                        fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                        color: skillGapQuery.data.gap_pct >= 60 ? "var(--tm-danger)" : skillGapQuery.data.gap_pct >= 30 ? "var(--tm-warning)" : "var(--tm-success)",
                        background: skillGapQuery.data.gap_pct >= 60 ? "var(--tm-danger-wash)" : skillGapQuery.data.gap_pct >= 30 ? "var(--tm-warning-wash)" : "var(--tm-success-wash)",
                      }}>
                        {skillGapQuery.data.missing_count}/{skillGapQuery.data.total_required} missing
                      </div>
                    )}
                  </div>
                  {skillGapQuery.isLoading && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} style={{ height: 44, borderRadius: "var(--tm-radius-sm)", background: "rgba(255,255,255,0.03)", animation: "pulse 2s infinite" }} />
                      ))}
                    </div>
                  )}
                  {skillGapQuery.data && (
                    <JobSkillGapPanel
                      skills={skillGapQuery.data.skills}
                      targetSkillKeys={targetSkillKeys}
                      onToggle={handleTargetToggle}
                    />
                  )}
                  {targetSkillKeys.size > 0 && (
                    <a
                      href={buildDiarySelectionsHref((jobPathQuery.data?.target_skills ?? []).map(t => ({ skill: t.skill, intent: "add" as const, source: "job-gap" as const })))}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        gap: 8, padding: "10px 14px", borderRadius: "var(--tm-radius-sm)",
                        background: "var(--tm-accent-wash)", border: "1px solid var(--tm-accent-ring)",
                        color: "var(--tm-accent)", fontSize: 13, fontWeight: 700,
                        textDecoration: "none", marginTop: 8,
                        letterSpacing: "0.02em",
                        transition: "all 0.15s var(--tm-ease)",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(0,245,212,0.15)" }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "var(--tm-accent-wash)" }}
                    >
                      ▶ Start forging {targetSkillKeys.size} queued skill{targetSkillKeys.size > 1 ? "s" : ""}
                    </a>
                  )}
                  {skillGapQuery.isError && (
                    <div style={{ fontSize: 13, color: "var(--tm-danger)", opacity: 0.8 }}>Failed to load skill gap.</div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-accent)", opacity: 0.7, marginBottom: 14 }}>
                    Skill Gaps · Overall
                  </div>
                  <div style={{ fontSize: 12, color: "var(--tm-text-faint)", marginBottom: 10 }}>
                    Skills from your CV ranked by number of jobs asking for them.
                  </div>
                  {skillDemandQuery.isLoading ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} style={{ height: 74, borderRadius: "var(--tm-radius-sm)", background: "rgba(255,255,255,0.03)", animation: "pulse 2s infinite" }} />
                      ))}
                    </div>
                  ) : topDemandSkills.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {topDemandSkills.map((s) => (
                        <CVSkillDemandCard
                          key={s.skill}
                          skill={s}
                          queued={queuedSkillKeys.has(skillSelectionKey(s.display_name))}
                          onToggle={handleDiaryToggle}
                        />
                      ))}
                    </div>
                  ) : skillDemandQuery.isError ? (
                    <div style={{ fontSize: 13, color: "var(--tm-danger)", opacity: 0.8 }}>
                      Could not load skill demand right now.
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: "var(--tm-text-faint)", fontStyle: "italic" }}>
                      Upload your CV to unlock demand-ranked skills.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
    </>
  )
}
