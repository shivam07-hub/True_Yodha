"use client"

import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { FirstRoleSuccess } from "@/components/onboarding/first-role-success"
import { ResultMatches } from "@/components/onboarding/result-matches"
import { jobs, onboarding, type FirstRoleReceipt, type OnboardingResult } from "@/lib/api"
import { trackEvent } from "@/lib/analytics"
import { dataKeys, invalidateJobData } from "@/lib/domain-data"

type FullResultData = Extract<OnboardingResult, { kind: "full_result_ready" }>
interface Props { token: string; result: FullResultData; onAdjust: () => Promise<void> }

export function FullResult({ token, result, onAdjust }: Props) {
  const queryClient = useQueryClient()
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<FirstRoleReceipt | null>(null)
  const [busy, setBusy] = useState(false)
  const [adjustBusy, setAdjustBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emptyPolls, setEmptyPolls] = useState(0)
  const matchQuery = useQuery({
    queryKey: [...dataKeys.jobs(), "onboarding-shortlist", result.target_context_hash] as const,
    queryFn: () => jobs.matches(token),
    refetchInterval: (query) => {
      const data = query.state.data
      if (query.state.status === "error") return false
      if ((data?.jobs.length ?? 0) > 0) return false
      return (!data || data.match_health === "computing") && query.state.dataUpdateCount < 20 ? 2_500 : false
    },
  })
  useEffect(() => {
    const data = matchQuery.data
    if (!data || data.jobs.length > 0 || data.match_health !== "computing") return
    setEmptyPolls((count) => Math.min(count + 1, 20))
  }, [matchQuery.data, matchQuery.dataUpdatedAt])
  const topMatches = (matchQuery.data?.jobs ?? []).slice(0, 3)
  const selectedJob = topMatches.find((job) => job.job_id === selectedJobId) ?? null
  const finding = topMatches.length === 0
    && !matchQuery.isError
    && (!matchQuery.data || (matchQuery.data.match_health === "computing" && emptyPolls < 20))
  const matchUnavailable = topMatches.length === 0
    && (matchQuery.isError || matchQuery.data?.match_health === "computing")

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
      ) : matchUnavailable ? (
        <div className="mt-6 rounded-lg border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] p-5">
          <p className="font-medium text-[var(--tm-text)]">Couldn&apos;t load your live roles</p>
          <p className="mt-2 text-pretty text-sm text-[var(--tm-text-muted)]">Your direction is saved. Try the shortlist again.</p>
          <Button size="sm" className="mt-4" disabled={matchQuery.isFetching} onClick={() => void matchQuery.refetch()}>{matchQuery.isFetching ? "Loading roles…" : "Try loading roles again"}</Button>
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
