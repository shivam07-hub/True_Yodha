"use client"

import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { NinjaNameCard } from "@/components/onboarding/ninja-name-card"
import { ResultMatches } from "@/components/onboarding/result-matches"
import { StickyOnboardingActionBar } from "@/components/onboarding/sticky-action-bar"
import { FeedCardSkeleton } from "@/components/jobs/feed-card"
import { onboarding, type OnboardingResult } from "@/lib/api"
import { trackEvent } from "@/lib/analytics"
import { invalidateJobData } from "@/lib/domain-data"
import { useMyroSearch } from "@/lib/hooks/use-myro-search"

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
  const router = useRouter()
  const queryClient = useQueryClient()
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [adjustBusy, setAdjustBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const topMatches = result.shortlist
  const selectedJob = topMatches.find((job) => job.job_id === selectedJobId) ?? null
  const finding = result.shortlist_status === "computing"
  const stalled = result.shortlist_status === "stalled"
  // A run finished, but for a different direction than this one. The stack is not
  // empty — it has never been searched for THIS target. The user pulls the run, so
  // the surface offers it through the same hook every other surface uses rather
  // than growing its own trigger.
  const staleDirection = result.shortlist_status === "stale_direction"
  const myroSearch = useMyroSearch(token)

  async function saveFirstRole() {
    if (!selectedJob || busy) return
    setBusy(true)
    setError(null)
    try {
      const next = await onboarding.commitFirstRole(token, selectedJob.job_id)
      trackEvent("onboarding_first_role_saved", { shortlist_position: topMatches.indexOf(selectedJob) + 1 })
      await invalidateJobData(queryClient)
      router.replace(next.tailor_href)
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

  return (
    <section className="w-full max-w-3xl pb-28" aria-labelledby="shortlist-title">
      {onBack && <button type="button" onClick={onBack} className="tm-control-focus -ml-1 mb-3 inline-flex min-h-9 items-center gap-1.5 rounded px-1 text-sm text-[var(--tm-text-muted)]"><ArrowLeft className="size-4" />Your direction</button>}
      <h1 id="shortlist-title" className="text-balance text-3xl font-semibold text-[var(--tm-text)] sm:text-4xl">Pick your first role</h1>
      <p className="mt-2 text-pretty text-sm leading-6 text-[var(--tm-text-muted)]">Choose one to save. Your tailored CV opens next.</p>

      {finding ? (
        <div className="mt-6 space-y-3" role="status" aria-label="Finding live roles">
          <span className="sr-only">Finding live roles</span>
          {[1, 2, 3].map((item) => <FeedCardSkeleton key={item} />)}
        </div>
      ) : stalled ? (
        <div className="mt-6 rounded-lg border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] p-5">
          <p className="font-medium text-[var(--tm-text)]">This is taking longer than it should</p>
          <p className="mt-2 text-pretty text-sm text-[var(--tm-text-muted)]">Your direction is saved and Myro has restarted the search.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" disabled={adjustBusy} onClick={() => void onAdjust()}>Choose a different direction</Button>
          </div>
        </div>
      ) : staleDirection ? (
        <div className="mt-6 rounded-lg border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] p-5">
          <p className="font-medium text-[var(--tm-text)]">Not searched for this direction yet</p>
          <p className="mt-2 text-pretty text-sm text-[var(--tm-text-muted)]">Your roles were matched to an earlier target. Run a search to match this one.</p>
          {error && <p role="alert" className="mt-3 text-sm text-[var(--tm-danger)]">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" disabled={myroSearch.isRefreshing} onClick={() => { trackEvent("onboarding_stale_direction_search"); myroSearch.run() }}>
              {myroSearch.isRefreshing ? "Searching…" : "Run Myro Search"}
            </Button>
            <Button size="sm" variant="outline" disabled={adjustBusy} onClick={() => void adjustDirection()}>{adjustBusy ? "Reopening direction…" : "Adjust my direction"}</Button>
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

      {/* Below the shortlist on purpose: the roles are what the user came for,
          and the naming moment lands after Myro has earned it, not before. It
          gates nothing and disappears once claimed. */}
      {!finding && <NinjaNameCard token={token} />}
      {myroSearch.gate}

      {selectedJob && (
        <StickyOnboardingActionBar error={error} contentClassName="max-w-3xl px-5 pt-3 sm:px-8">
          <Button size="lg" className="min-h-12 w-full" disabled={busy} onClick={() => void saveFirstRole()}>
            {busy ? "Saving your role…" : `Save ${selectedJob.title} at ${selectedJob.company || "this company"} →`}
          </Button>
        </StickyOnboardingActionBar>
      )}
    </section>
  )
}
