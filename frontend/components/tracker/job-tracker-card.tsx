"use client"

import { ExternalLink } from "lucide-react"
import type { JobMatch, ApplicationStatus } from "@/lib/api"

export const STATUSES: ApplicationStatus[] = [
  "pending", "applied", "no_response", "responded", "interviewing", "rejected", "offer",
]

export const STATUS_META: Record<ApplicationStatus, { label: string; dot: string; pill: string }> = {
  pending:      { label: "Pending",      dot: "bg-muted-foreground/40", pill: "bg-muted text-muted-foreground" },
  applied:      { label: "Applied",      dot: "bg-blue-500",            pill: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  no_response:  { label: "No response",  dot: "bg-amber-500",           pill: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  responded:    { label: "Responded",    dot: "bg-cyan-500",            pill: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400" },
  interviewing: { label: "Interviewing", dot: "bg-purple-500",          pill: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
  rejected:     { label: "Rejected",     dot: "bg-red-500",             pill: "bg-red-500/10 text-red-600 dark:text-red-400" },
  offer:        { label: "Offer 🎉",     dot: "bg-emerald-500",         pill: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
}

function scoreTone(score: number) {
  if (score >= 75) return "bg-emerald-500"
  if (score >= 50) return "bg-amber-500"
  return "bg-muted-foreground"
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
  const firstPlan = job.action_plan[0]

  return (
    <article className="rounded-xl border border-border bg-card p-4 space-y-3">
      {/* Title + score */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold leading-snug">{job.title}</h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[job.company, job.location, job.remote ? "Remote" : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums">
          {Math.round(job.overlap_score)}%
        </span>
      </div>

      {/* Overlap bar */}
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${scoreTone(job.overlap_score)}`}
            style={{ width: `${Math.min(100, Math.max(0, job.overlap_score))}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground">skill match</span>
      </div>

      {/* LLM explanation */}
      {job.llm_explanation && (
        <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
          {job.llm_explanation}
        </p>
      )}

      {/* First move */}
      {firstPlan && (
        <div className="rounded-md bg-muted/60 px-2.5 py-1.5 text-xs">
          <span className="font-medium">Next move: </span>
          <span className="text-muted-foreground">{firstPlan.focus}</span>
        </div>
      )}

      {/* Footer row: status + links */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        {tracked ? (
          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${meta.pill}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
              {meta.label}
            </span>
            <select
              value={status}
              disabled={updating}
              onChange={(e) => onStatusChange(e.target.value as ApplicationStatus)}
              className="rounded-md border border-input bg-background px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_META[s].label}</option>
              ))}
            </select>
          </div>
        ) : (
          <button
            onClick={onAddToTracker}
            disabled={updating}
            className="rounded-full border border-border px-3 py-1 text-[11px] font-medium hover:bg-secondary transition-colors"
          >
            + Track this role
          </button>
        )}

        <div className="flex items-center gap-2">
          {appliedAt && (
            <span className="text-[10px] text-muted-foreground">
              {new Date(appliedAt).toLocaleDateString()}
            </span>
          )}
          {job.source_url && (
            <a
              href={job.source_url}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground"
              title="Open job posting"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </article>
  )
}
