"use client"

import { ExternalLink } from "lucide-react"
import type { JobMatch, ApplicationStatus } from "@/lib/api"

export const STATUSES: ApplicationStatus[] = [
  "pending", "applied", "no_response", "responded", "interviewing", "rejected", "offer",
]

export const STATUS_META: Record<ApplicationStatus, { label: string; fg: string; bg: string; border: string }> = {
  pending:      { label: "Pending",      fg: "var(--tm-accent)",   bg: "var(--tm-accent-wash)",   border: "rgba(0,245,212,0.2)" },
  applied:      { label: "Applied",      fg: "var(--tm-accent)",   bg: "var(--tm-accent-wash)",   border: "rgba(0,245,212,0.2)" },
  no_response:  { label: "No response",  fg: "var(--tm-warning)",  bg: "var(--tm-warning-wash)",  border: "rgba(245,158,11,0.2)" },
  responded:    { label: "Responded",    fg: "var(--tm-accent)",   bg: "var(--tm-accent-wash)",   border: "rgba(0,245,212,0.2)" },
  interviewing: { label: "Interviewing", fg: "var(--tm-success)",  bg: "var(--tm-success-wash)",  border: "rgba(74,222,128,0.2)" },
  rejected:     { label: "Rejected",     fg: "var(--tm-danger)",   bg: "var(--tm-danger-wash)",   border: "rgba(251,113,133,0.2)" },
  offer:        { label: "Offer 🎉",     fg: "var(--tm-success)",  bg: "var(--tm-success-wash)",  border: "rgba(74,222,128,0.3)" },
}

function companyInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 3)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 3)
}

interface JobTrackerCardProps {
  job: JobMatch
  status: ApplicationStatus
  appliedAt: string | null
  onStatusChange: (status: ApplicationStatus) => void
  onAddToTracker: () => void
  updating: boolean
  tracked: boolean
}

export function JobTrackerCard({
  job,
  status,
  appliedAt,
  onStatusChange,
  onAddToTracker,
  updating,
  tracked,
}: JobTrackerCardProps) {
  const meta = STATUS_META[status]
  const score = Math.min(100, Math.max(0, Math.round(job.overlap_score)))
  const firstPlan = job.action_plan[0]
  const scoreColor = score >= 75 ? "var(--tm-accent)" : score >= 55 ? "var(--tm-warning)" : "var(--tm-danger)"

  return (
    <article
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRadius: "var(--tm-radius-lg)",
        background: "var(--tm-surface)",
        border: "1px solid var(--tm-border-soft)",
        padding: "var(--tm-card-pad)",
        backdropFilter: "blur(20px)",
        transition: "all var(--tm-dur) var(--tm-ease)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--tm-accent-ring)"
        e.currentTarget.style.boxShadow = "var(--tm-shadow-2)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--tm-border-soft)"
        e.currentTarget.style.boxShadow = "none"
      }}
    >
      {/* Status badge */}
      {tracked && (
        <span style={{
          position: "absolute",
          right: 16,
          top: 16,
          padding: "3px 10px",
          borderRadius: "var(--tm-radius-pill)",
          fontSize: "var(--tm-fs-meta)",
          fontWeight: 500,
          color: meta.fg,
          background: meta.bg,
          border: `1px solid ${meta.border}`,
        }}>
          {meta.label}
        </span>
      )}

      {/* Company logo + title */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <div style={{
          width: 48,
          height: 48,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "var(--tm-radius)",
          border: "1px solid var(--tm-border)",
          background: "var(--tm-surface-2)",
          fontSize: 11,
          fontWeight: 700,
          color: "var(--tm-accent)",
          fontFamily: "var(--tm-font-mono)",
        }}>
          {companyInitials(job.company || "?")}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "var(--tm-fs-heading)", fontWeight: 500, color: "var(--tm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {job.title}
          </div>
          <div style={{ marginTop: 2, fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[job.company, job.location, job.remote ? "Remote" : null].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>

      {/* Match alignment bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "var(--tm-tracking-caps)", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
            Match Alignment
          </span>
          <span style={{ fontSize: "var(--tm-fs-heading)", fontWeight: 500, color: scoreColor }}>{score}%</span>
        </div>
        <div style={{ height: 3, borderRadius: 999, background: "var(--tm-border-soft)", overflow: "hidden" }}>
          <div style={{
            height: "100%",
            borderRadius: 999,
            width: `${score}%`,
            background: `linear-gradient(90deg, ${scoreColor}, ${scoreColor})`,
            transition: "width 700ms var(--tm-ease)",
          }} />
        </div>
      </div>

      {/* LLM explanation */}
      {job.llm_explanation && (
        <p style={{ marginBottom: 12, fontSize: "var(--tm-fs-meta)", lineHeight: "var(--tm-lh-body)", color: "var(--tm-text-muted)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {job.llm_explanation}
        </p>
      )}

      {/* Next move */}
      {firstPlan && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: "var(--tm-radius)", background: "var(--tm-accent-wash)", border: "1px solid var(--tm-border-soft)", fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-muted)" }}>
          <span style={{ fontWeight: 600, color: "var(--tm-accent)" }}>Next: </span>
          {firstPlan.focus}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 8 }}>
        {tracked ? (
          <select
            value={status}
            disabled={updating}
            onChange={(e) => onStatusChange(e.target.value as ApplicationStatus)}
            style={{
              padding: "6px 10px",
              borderRadius: "var(--tm-radius)",
              border: "1px solid var(--tm-border)",
              background: "var(--tm-surface-2)",
              color: "var(--tm-text)",
              fontSize: "var(--tm-fs-meta)",
              fontFamily: "inherit",
              cursor: "pointer",
              outline: "none",
            }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s} style={{ background: "var(--tm-surface-2)" }}>{STATUS_META[s].label}</option>
            ))}
          </select>
        ) : (
          <button
            onClick={onAddToTracker}
            disabled={updating}
            className="tm-btn tm-btn-ghost"
            style={{ height: 32, padding: "0 14px", fontSize: "var(--tm-fs-meta)" }}
          >
            + Track role
          </button>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {appliedAt && (
            <span style={{ fontSize: 10, color: "var(--tm-text-faint)" }}>
              {new Date(appliedAt).toLocaleDateString()}
            </span>
          )}
          {job.source_url && (
            <a
              href={job.source_url}
              target="_blank"
              rel="noreferrer"
              title="Open job posting"
              style={{ color: "var(--tm-text-muted)", transition: "color var(--tm-dur) var(--tm-ease)" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--tm-accent)" }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--tm-text-muted)" }}
            >
              <ExternalLink style={{ width: 14, height: 14 }} />
            </a>
          )}
        </div>
      </div>
    </article>
  )
}
