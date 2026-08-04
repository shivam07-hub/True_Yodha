"use client"

import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { FirstRoleSuccess } from "@/components/onboarding/first-role-success"
import { OpsReceipt } from "@/components/onboarding/ops-receipt"
import { ResultMatches } from "@/components/onboarding/result-matches"
import { onboarding, type FirstRoleReceipt, type OnboardingResult } from "@/lib/api"
import { trackEvent } from "@/lib/analytics"
import { invalidateJobData } from "@/lib/domain-data"

type FullResultData = Extract<OnboardingResult, { kind: "full_result_ready" }>
interface Props {
  token: string
  result: FullResultData
  /** Review the direction with the answers intact. Nothing is cleared. */
  onBack?: () => void
  /** Clear the target and choose again — the destructive one. */
  onAdjust: () => Promise<void>
}

/**
 * The shortlist comes from the result payload, NOT from `jobs.matches`.
 *
 * `jobs.matches` is the durable, direction-blind match stack — every job Myro
 * has ever matched this user to. Rendering it here meant that after a direction
 * change the previous direction's cards stayed on screen, clickable, while
 * `commit_first_role` (which has always checked baseline + direction) answered
 * the click with "Choose a role from your current shortlist."
 *
 * The server now resolves the shortlist and the save through one function, and
 * reports an honest status, so this component renders a state instead of
 * inferring one from an empty list.
 */
export function FullResult({ token, result, onBack, onAdjust }: Props) {
  const queryClient = useQueryClient()
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<FirstRoleReceipt | null>(null)
  const [busy, setBusy] = useState(false)
  const [adjustBusy, setAdjustBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const topMatches = result.shortlist
  const selectedJob = topMatches.find((job) => job.job_id === selectedJobId) ?? null
  const finding = result.shortlist_status === "computing"
  const stalled = result.shortlist_status === "stalled"

  async function saveFirstRole() {
    if (!selectedJob || busy) return
    setBusy(true)
    setError(null)
    try {
      const next = await onboarding.commitFirstRole(token, selectedJob.job_id)
      setReceipt(next)
      trackEvent("onboarding_first_role_saved", { shortlist_position: topMatches.indexOf(selectedJob) + 1 })
      await invalidateJobData(queryClient)
    } catch (reason) {
      setBusy(false)
      setError(reason instanceof Error ? reason.message : "This role could not be saved. Try again.")
    }
  }

  async function adjustDirection() {
    if (adjustBusy) return
    setAdjustBusy(true)
    setError(null)
    try {
      await onAdjust()
      trackEvent("onboarding_direction_reopened")
    } catch (reason) {
      setAdjustBusy(false)
      setError(reason instanceof Error ? reason.message : "Your direction could not be reopened. Try again.")
    }
  }

  if (receipt && selectedJob) {
    return <FirstRoleSuccess title={selectedJob.title} company={selectedJob.company ?? ""} tailorHref={receipt.tailor_href} />
  }

  return (
    <section className="w-full max-w-3xl" aria-labelledby="shortlist-title">
      {onBack && <button type="button" onClick={onBack} className="tm-control-focus -ml-1 mb-3 inline-flex min-h-9 items-center gap-1.5 rounded px-1 text-sm text-[var(--tm-text-muted)]"><ArrowLeft className="size-4" />Your direction</button>}
      <p className="text-sm font-semibold text-[var(--tm-interactive)]">Step 3 of 3</p>
      <h1 id="shortlist-title" className="mt-2 text-balance text-3xl font-semibold text-[var(--tm-text)] sm:text-4xl">Your first live shortlist</h1>
      <p className="mt-3 text-pretty text-sm leading-6 text-[var(--tm-text-muted)]">Choose one role worth pursuing. You can explore every match after this first decision.</p>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {[result.target.role_title, result.target.seniority, result.target.location].filter(Boolean).map((item) => <span key={item} className="rounded border border-[var(--tm-border)] bg-[var(--tm-surface)] px-3 py-1.5 capitalize text-[var(--tm-text-muted)]">{item}</span>)}
      </div>

      {finding ? (
        <div className="mt-6 space-y-3" role="status" aria-label="Finding live roles">
          <span className="sr-only">Finding live roles</span>
          {[1, 2, 3].map((item) => <div key={item} className="rounded-lg border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] p-5" aria-hidden="true"><div className="h-5 w-2/3 rounded bg-[var(--tm-skeleton)]" /><div className="mt-3 h-4 w-1/2 rounded bg-[var(--tm-skeleton)]" /></div>)}
        </div>
      ) : stalled ? (
        <div className="mt-6 rounded-lg border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] p-5">
          <p className="font-medium text-[var(--tm-text)]">This is taking longer than it should</p>
          <p className="mt-2 text-pretty text-sm text-[var(--tm-text-muted)]">Your direction is saved and Myro has restarted the search.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" disabled={adjustBusy} onClick={() => void onAdjust()}>Choose a different direction</Button>
          </div>
        </div>
      ) : topMatches.length > 0 ? (
        <ResultMatches matches={topMatches} selectedJobId={selectedJobId} onSelect={(jobId) => { setSelectedJobId(jobId); setError(null); trackEvent("onboarding_shortlist_role_selected", { shortlist_position: topMatches.findIndex((job) => job.job_id === jobId) + 1 }) }} />
      ) : (
        <div className="mt-6 rounded-lg border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] p-5">
          <p className="text-pretty text-sm text-[var(--tm-text-muted)]">No live roles match this direction yet.</p>
          {error && <p role="alert" className="mt-3 text-sm text-[var(--tm-danger)]">{error}</p>}
          <Button size="sm" variant="outline" className="mt-4" disabled={adjustBusy} onClick={() => void adjustDirection()}>{adjustBusy ? "Reopening direction…" : "Adjust my direction"}</Button>
        </div>
      )}

      {topMatches.length > 0 && (
        <OpsReceipt
          target={result.target}
          sharpeners={result.career_ops?.sharpeners ?? []}
          cvReady={Boolean(result.baseline_version_id)}
        />
      )}

      {selectedJob && (
        <div className="mt-7 border-t border-[var(--tm-border-soft)] pt-5">
          {error && <p role="alert" className="mb-3 text-sm text-[var(--tm-danger)]">{error}</p>}
          <Button size="lg" className="min-h-12 w-full" disabled={busy} onClick={() => void saveFirstRole()}>
            {busy ? "Saving your role…" : `Save ${selectedJob.title} at ${selectedJob.company || "this company"} →`}
          </Button>
        </div>
      )}
    </section>
  )
}
