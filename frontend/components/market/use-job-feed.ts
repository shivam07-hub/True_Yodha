"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query"
import { jobs, type JobFeedItem, type JobFeedResponse } from "@/lib/api"
import type { FeedScope } from "@/lib/feed-scope"
import { agentPicksQueryKey, dropJobFromAgentPicks, removeJobFromPages } from "@/lib/jobs/job-triage-cache"
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
type BrowseScope = "exact" | "remote_country" | "country"
type FeedPageParam = { page: number; scope: BrowseScope }

const NEXT_SCOPE: Record<BrowseScope, BrowseScope | null> = {
  exact: "remote_country",
  remote_country: "country",
  country: null,
}

/**
 * The triage feed: infinite query keyed on the full filter set, plus Save/Skip
 * mutations that optimistically drain the card from the queue and expose a 5s
 * Undo. A new triage commits any still-pending one first (single-slot undo).
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
  q: string
  /** Active skill facet — filters the feed by skill membership, distinct from
   *  the free-text `q`. Null when no skill mover is selected. */
  skill: string | null
  /** Where the feed is looking. Keys the cache only — the server scopes to the
   *  same saved locations itself, so no city goes on the wire. */
  scope: FeedScope
}) {
  const qc = useQueryClient()
  const yieldLane = useLaneYields()
  const [pending, setPending] = useState<PendingUndo | null>(null)
  const [savedCount, setSavedCount] = useState(0)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Rank (sort) + the hard filters key the query.
  const queryKey = useMemo(
    () => jobFeedQueryKey({ token, filters, q, skill, scope }),
    [token, q, skill, filters, scope],
  )

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
  const feed = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      jobs.feed(token, {
        // roleDomain holds the selected target-role cluster label; the backend
        // resolves it to jobs.role_domain (passing it raw would skip resolution).
        cluster: filters.roleDomain,
        q: q || null,
        skill: skill || null,
        sort: filters.sort,
        locationMode: filters.locationMode,
        minSkillMatches: filters.minSkillMatches,
        followingOnly: filters.followingOnly,
        includeStretch: filters.includeStretch,
        page: pageParam.page,
        pageSize: 20,
        browseScope: pageParam.scope,
      }),
    initialPageParam: { page: 1, scope: "exact" } as FeedPageParam,
    getNextPageParam: last => {
      if (last.has_next_page) return { page: last.page + 1, scope: last.expansion_tier }
      const scope = NEXT_SCOPE[last.expansion_tier]
      return scope ? { page: 1, scope } : undefined
    },
    enabled: !!token && !yieldLane,
    staleTime: 30 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  })

  const allJobs = useMemo(() => {
    const seen = new Set<string>()
    return (feed.data?.pages.flatMap((page) => page.jobs) ?? []).filter((job) => {
      if (seen.has(job.job_id)) return false
      seen.add(job.job_id)
      return true
    })
  }, [feed.data])
  // The one client-side pass, applied here so BOTH skins inherit it (a skin
  // that filtered locally is how desktop and mobile drifted apart).
  const visibleJobs = useMemo(() => applyViewFilters(allJobs, filters), [allJobs, filters])
  const total = Math.max(0, ...(feed.data?.pages.map((page) => page.available_total) ?? [0]))
  // Loading = the feed query is enabled but has not produced a first result yet.
  // Keeping the skeleton up until the query SETTLES (rather than until some
  // pre-phase resolves) is what stops the "Feed clear" empty state flashing in
  // the tick before the first cards arrive.
  const feedSettled = feed.isSuccess || feed.isError
  const loading = !!token && !feedSettled
  // How many leading cards the brain ranked (page 1 only — the shortlist lives at
  // the top of the feed). The feed draws its "more roles" divider after this many.
  const rankedCount = feed.data?.pages[0]?.ranked_count ?? 0
  const expansionDividers = useMemo(() => {
    const seen = new Set<string>()
    const dividers: Array<{ beforeJobId: string; label: string }> = []
    for (const page of feed.data?.pages ?? []) {
      const firstNew = page.jobs.find((job) => !seen.has(job.job_id))
      if (page.page === 1 && page.expansion_tier !== "exact" && page.expansion_label && firstNew) {
        dividers.push({ beforeJobId: firstNew.job_id, label: page.expansion_label })
      }
      page.jobs.forEach((job) => seen.add(job.job_id))
    }
    return dividers
  }, [feed.data])

  useEffect(() => {
    if (yieldLane) return
    const last = feed.data?.pages.at(-1)
    if (last && last.returned_total === 0 && feed.hasNextPage && !feed.isFetchingNextPage) {
      void feed.fetchNextPage()
    }
  }, [feed, yieldLane])

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
      qc.setQueryData<InfiniteData<JobFeedResponse>>(queryKey, prev => removeJobFromPages(prev, job.job_id))
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
      undoTimer.current = setTimeout(() => setPending(null), UNDO_MS)
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
  return { feed, allJobs, visibleJobs, total, rankedCount, loading, settled: feedSettled, expansionDividers, triage, undo, pending, commitPending, savedCount }
}
