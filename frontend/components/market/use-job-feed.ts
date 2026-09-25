"use client"

import { REASON_PROMPT_MS } from "@/lib/jobs/feedback"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { jobs, type JobFeedItem, type JobFeedResponse } from "@/lib/api"
import type { FeedScope } from "@/lib/feed-scope"
import { agentPicksQueryKey, dropJobFromAgentPicks, removeJobFromList } from "@/lib/jobs/job-triage-cache"
import { useLaneYields } from "@/store/matchRunStore"
import { applyViewFilters, type FeedFilters } from "./feed-types"
import { jobFeedQueryKey } from "./job-feed-query-key"

export type TriageKind = "saved" | "skipped"

export interface PendingUndo {
  jobId: string
  kind: TriageKind
  job: JobFeedItem
  operation: Promise<boolean>
}

const UNDO_MS = 6000
// A skip asks why (`SkipReasonChips` rides the same toast), and a question needs
// longer on screen than a reflex does. Undo stays available for as long as the
// question does — the skip is already recorded either way.
const SKIP_UNDO_MS = REASON_PROMPT_MS

/**
 * The finite list: ONE query, plus Save/Skip mutations that optimistically drain
 * the card and expose a 5s Undo. A new triage commits any still-pending one first
 * (single-slot undo).
 *
 * It was an infinite query over a paginated feed with a three-tier expansion
 * ladder — exact locations, then remote-in-country, then the whole country —
 * which existed because the feed could run dry, which it did because it was
 * filtering a 500-row sample. Retrieval searches the whole corpus per user now,
 * so there is one page, and it is the answer.
 */
export function useJobFeed({
  token,
  filters,
  q,
  skill,
  scope,
}: {
  token: string
  filters: FeedFilters
  /** Free text, searching the list the user has — not the corpus. ⌘K is corpus
   *  search. Never keys the query: the list does not change, the view does. */
  q: string
  /** The active skill chip from the rail. Also view-scope, same reason. */
  skill: string | null
  /** Where the list is looking. Keys the cache only — retrieval scopes to the
   *  same saved locations itself, so no city goes on the wire. */
  scope: FeedScope
}) {
  const qc = useQueryClient()
  const yieldLane = useLaneYields()
  const [pending, setPending] = useState<PendingUndo | null>(null)
  const [savedCount, setSavedCount] = useState(0)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const queryKey = useMemo(() => jobFeedQueryKey({ token, scope }), [token, scope])

  // NO brain warm on this path. 3799e114 took the feed-warm call out of this
  // hook — it was wait-then-paint, blocking the J0 feed on a paid blocking-
  // judgment LLM call — and locked that in with the "Jobs paints its J0 feed
  // before secondary compute" contract test. c73aa23a reintroduced it while
  // consolidating location derivation (its subject and body are entirely about
  // feedScope; the warm is not mentioned), which put the LLM back on the arrival
  // path and left Develop failing that test.
  //
  // A card still ranks whenever the brain has already warmed it — GET /feed
  // reads the cached evals and floats those cards above the divider. What is
  // gone is a client trigger that warms ON ARRIVAL. Restoring one belongs on a
  // deferred wave with the feed invalidating when it resolves, never here.
  const feed = useQuery({
    queryKey,
    queryFn: () => jobs.feed(token),
    enabled: !!token && !yieldLane,
    staleTime: 30 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  })

  const allJobs = useMemo(() => feed.data?.jobs ?? [], [feed.data])
  // The one client-side pass, applied here so BOTH skins inherit it (a skin that
  // filtered locally is how desktop and mobile drifted apart).
  const visibleJobs = useMemo(
    () => applyViewFilters(allJobs, filters, { q, skill }),
    [allJobs, filters, q, skill],
  )
  const total = allJobs.length
  const shortlistSize = feed.data?.shortlist_size ?? 0
  // Loading = the query is enabled but has not produced a first result yet.
  // Keeping the skeleton up until the query SETTLES (rather than until some
  // pre-phase resolves) is what stops the "Feed clear" empty state flashing in
  // the tick before the first cards arrive.
  const feedSettled = feed.isSuccess || feed.isError
  const loading = !!token && !feedSettled
  // How many leading cards the brain ranked. The list draws its "more roles"
  // divider after this many.
  const rankedCount = feed.data?.ranked_count ?? 0
  const judgment = feed.data?.judgment ?? null

  const clearUndoTimer = useCallback(() => {
    if (undoTimer.current) { clearTimeout(undoTimer.current); undoTimer.current = null }
  }, [])

  // Commit the pending triage (let it stand) — just drop the undo affordance.
  const commitPending = useCallback(() => { clearUndoTimer(); setPending(null) }, [clearUndoTimer])

  const triage = useCallback(
    (job: JobFeedItem, kind: TriageKind) => {
      // Any still-pending triage commits immediately (single undo slot).
      clearUndoTimer()
      // Optimistic drain.
      qc.setQueryData<JobFeedResponse>(queryKey, prev => removeJobFromList(prev, job.job_id))
      dropJobFromAgentPicks(qc, token, job.job_id)
      if (kind === "saved") setSavedCount(c => c + 1)
      const call = kind === "saved" ? jobs.saveJob(token, job.job_id) : jobs.skipJob(token, job.job_id)
      const operation = call.then(() => true).catch(() => {
        // Roll back the optimistic drain on failure so the card isn't lost.
        void qc.invalidateQueries({ queryKey })
        void qc.invalidateQueries({ queryKey: agentPicksQueryKey(token) })
        if (kind === "saved") setSavedCount(c => Math.max(0, c - 1))
        return false
      })
      setPending({ jobId: job.job_id, kind, job, operation })
      undoTimer.current = setTimeout(() => setPending(null), kind === "skipped" ? SKIP_UNDO_MS : UNDO_MS)
    },
    [qc, queryKey, token, clearUndoTimer],
  )

  const undo = useCallback(() => {
    if (!pending) return
    const { jobId, kind, operation } = pending
    clearUndoTimer()
    void operation.then((committed) => {
      const refresh = () => {
        void qc.invalidateQueries({ queryKey })
        void qc.invalidateQueries({ queryKey: agentPicksQueryKey(token) })
      }
      if (!committed) return refresh()
      const reverse = kind === "saved" ? jobs.removeTrackerJob(token, jobId) : jobs.unskipJob(token, jobId)
      return reverse.then(refresh).catch(refresh)
    })
    if (kind === "saved") setSavedCount(c => Math.max(0, c - 1))
    setPending(null)
  }, [pending, token, qc, queryKey, clearUndoTimer])

  useEffect(() => clearUndoTimer, [clearUndoTimer])

  // `warming` is gone: it sat here hardcoded false for consumers that no longer
  // existed. The real flag comes from `useFeedWarm`, which owns the deferred warm.
  // `settled` is J0's paint signal — that hook gates on it, and reading it from the
  // query is what keeps "after J0" a fact rather than a timer.
  return { feed, allJobs, visibleJobs, total, shortlistSize, rankedCount, judgment, loading, settled: feedSettled, triage, undo, pending, commitPending, savedCount }
}
