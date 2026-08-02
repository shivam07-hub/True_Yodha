"use client"

import { Check } from "lucide-react"
import type { JobMatch } from "@/lib/api"
import { matchFitScore, verdictLabel } from "@/lib/jobs/match-verdict"
import { cn } from "@/lib/utils"

interface Props {
  matches: JobMatch[]
  selectedJobId: string | null
  onSelect: (jobId: string) => void
}

export function ResultMatches({ matches, selectedJobId, onSelect }: Props) {
  return (
    <div className="mt-6 space-y-3" role="radiogroup" aria-label="Choose one role to save">
      {matches.map((job) => {
        const selected = selectedJobId === job.job_id
        const why = (job.matched_skills ?? []).slice(0, 3)
        return (
          <label
            key={job.job_id}
            className={cn(
              "block min-h-24 cursor-pointer rounded-lg border bg-[var(--tm-surface)] p-4 sm:p-5",
              "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--tm-int-border)]",
              selected ? "border-[var(--tm-interactive)] bg-[var(--tm-int-bg-wash)]" : "border-[var(--tm-border-soft)]",
            )}
          >
            <input
              type="radio"
              name="first-shortlist-role"
              value={job.job_id}
              checked={selected}
              onChange={() => onSelect(job.job_id)}
              className="sr-only"
            />
            <span className="flex items-start gap-4">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold text-[var(--tm-text)]">{job.title}</span>
                <span className="mt-1 block truncate text-sm text-[var(--tm-text-muted)]">
                  {[job.company, job.location].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-base font-semibold tabular-nums text-[var(--tm-interactive)]">{Math.round(matchFitScore(job))}%</span>
                {job.verdict !== "checking" && <span className="block text-xs text-[var(--tm-text-muted)]">{verdictLabel(job.verdict)}</span>}
              </span>
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border", selected ? "border-[var(--tm-interactive)] bg-[var(--tm-interactive)] text-[var(--tm-interactive-fg)]" : "border-[var(--tm-border)] text-transparent")} aria-hidden="true">
                <Check className="size-3.5" />
              </span>
            </span>
            {why.length > 0 && (
              <span className="mt-4 flex flex-wrap gap-2">
                {why.map((skill) => <span key={skill} className="rounded border border-[var(--tm-border-soft)] px-2 py-1 text-xs text-[var(--tm-text-muted)]">{skill}</span>)}
              </span>
            )}
          </label>
        )
      })}
    </div>
  )
}
