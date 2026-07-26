"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Check, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { jobs as jobsApi, type JobMatch, type MatchHealth } from "@/lib/api"
import { invalidateJobData } from "@/lib/domain-data"
import { matchFitScore, verdictLabel } from "@/lib/jobs/match-verdict"

interface Props {
  token: string
  matches: JobMatch[]
  health: MatchHealth | null
  /** Still polling for the first stack to land. */
  finding: boolean
  /** The onboarding activation hook — same contract as FullResult's buttons. */
  onAction: (kind: string, href: string) => void
  /** Lifts the commitment count so the page can end on the right next step. */
  onSavedCountChange: (count: number) => void
}

/**
 * The onboarding payoff: the user's first real openings, actionable in place.
 *
 * Measured 2026-07-27: 300 users reached a score, 300 got one, and 252 of them
 * never saved a single job. This surface already listed the top 3 — as inert
 * text. A user who recognised their next role could read it and do nothing
 * with it; the only affordance was navigating away to an unfiltered feed to
 * find it again. Peak intent had no place to land.
 *
 * So: Save is on the row. It is the cheapest possible commitment and it is
 * exactly the action the funnel is missing.
 */
export function ResultMatches({
  token,
  matches,
  health,
  finding,
  onAction,
  onSavedCountChange,
}: Props) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [failed, setFailed] = useState<Set<string>>(new Set())

  function commit(next: Set<string>) {
    setSaved(next)
    onSavedCountChange(next.size)
  }

  function save(job: JobMatch) {
    setFailed((prev) => { const next = new Set(prev); next.delete(job.job_id); return next })
    commit(new Set(saved).add(job.job_id))
    void jobsApi
      .saveJob(token, job.job_id)
      .then(() => invalidateJobData(queryClient))
      .catch(() => {
        // Revert rather than leave a ✓ over a job that was never saved — a
        // false receipt is worse than the failure.
        const reverted = new Set(saved)
        reverted.delete(job.job_id)
        commit(reverted)
        setFailed((prev) => new Set(prev).add(job.job_id))
      })
  }

  if (matches.length === 0) {
    return (
      <div className="mt-5">
        <p className="text-sm font-semibold text-[var(--tm-text)]">Your first openings</p>
        <div className="mt-2 rounded-md border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] px-4 py-3">
          {finding || health === "computing" ? (
            <p className="flex items-center gap-2 text-sm text-[var(--tm-text-muted)]">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Reading live postings against your CV…
            </p>
          ) : (
            <>
              {/* This used to claim the matches were waiting in the feed no
                  matter what — including when the stack was empty, which sent
                  the user to a feed with nothing in it. Say the true thing. */}
              <p className="text-sm text-[var(--tm-text-muted)]">
                No live openings match this target yet. Widen the role or city and
                Myro will keep looking.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => onAction("browse_jobs", "/market")}
              >
                Adjust what you&apos;re looking for
              </Button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-5">
      <p className="text-sm font-semibold text-[var(--tm-text)]">
        Your first openings
      </p>
      <p className="mt-1 text-xs text-[var(--tm-text-muted)]">
        Live postings, read against your CV. Save the ones worth your time.
      </p>

      <ul className="mt-2 divide-y divide-[var(--tm-border-soft)] rounded-md border border-[var(--tm-border-soft)] bg-[var(--tm-surface)]">
        {matches.map((job) => {
          const isSaved = saved.has(job.job_id)
          const why = (job.matched_skills ?? []).slice(0, 3)
          return (
            <li key={job.job_id} className="px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--tm-text)]">{job.title}</p>
                  <p className="truncate text-xs text-[var(--tm-text-muted)]">
                    {[job.company, job.location].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="block text-sm font-semibold tabular-nums text-[var(--tm-interactive)]">
                    {Math.round(matchFitScore(job))}%
                  </span>
                  {job.verdict !== "checking" && (
                    <span className="block text-[11px] text-[var(--tm-text-muted)]">
                      {verdictLabel(job.verdict)}
                    </span>
                  )}
                </div>
              </div>

              {/* Why it matched — the user's OWN skills, never invented. */}
              {why.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {why.map((skill) => (
                    <li
                      key={skill}
                      className="rounded border border-[var(--tm-border-soft)] px-2 py-0.5 text-[11px] text-[var(--tm-text-muted)]"
                    >
                      {skill}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={isSaved ? "neutral" : "solid"}
                  onClick={() => save(job)}
                  disabled={isSaved}
                  aria-label={isSaved ? `${job.title} saved` : `Save ${job.title}`}
                >
                  {isSaved ? <><Check className="size-4" aria-hidden="true" />Saved</> : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onAction("tailor_credible_job", `/cv?jobId=${encodeURIComponent(job.job_id)}`)
                  }
                >
                  Tailor CV
                </Button>
                {failed.has(job.job_id) && (
                  <span role="alert" className="text-xs text-[var(--tm-danger)]">
                    Couldn&apos;t save — tap again.
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={() => router.push("/market")}
        className="tm-control-focus mt-2 rounded text-xs font-medium text-[var(--tm-interactive)]"
      >
        See every match →
      </button>
    </div>
  )
}
