"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query"
import { jobs, type JobFeedItem, type JobFeedResponse } from "@/lib/api"
import type { FeedFilters } from "./feed-types"
import { jobFeedQueryKey, targetLocationSignature } from "./job-feed-query-key"

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

/** Drop a job from every page of the cached infinite feed + decrement the
 *  first page's available_total (the draining-queue count). */
function removeJobFromPages(
  data: InfiniteData<JobFeedResponse> | undefined,
  jobId: string,
): InfiniteData<JobFeedResponse> | undefined {
  if (!data) return data
  return {
    ...data,
    pages: data.pages.map((p, i) => ({
      ...p,
      jobs: p.jobs.filter(j => j.job_id !== jobId),
      available_total: i === 0 ? Math.max(0, p.available_total - 1) : p.available_total,
    })),
  }
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
  targetLocations,
}: {
  token: string
  filters: FeedFilters
  q: string
  /** Active skill facet — filters the feed by skill membership, distinct from
   *  the free-text `q`. Null when no skill mover is selected. */
  skill: string | null
  targetLocations: string[]
}) {
  const qc = useQueryClient()
  const [pending, setPending] = useState<PendingUndo | null>(null)
  const [savedCount, setSavedCount] = useState(0)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Rank (sort) + the hard filters key the query.
  const queryKey = useMemo(
    () => jobFeedQueryKey({ token, filters, q, skill, targetLocations }),
    [token, q, skill, filters, targetLocations],
  )

  // The "best jobs" rule: on Best fit, the career-ops brain ranks the top shortlist
  // BEFORE the feed paints (wait-then-paint) so the first cards are always the final
  // brain-ranked order — no reshuffle flicker. Scoped to the same filters as the feed
  // (sort-independent — the warm always ranks the fit-top). Soft-resolves on any
  // failure/timeout so the feed still paints deterministic order (degradation).
  const gateOnBrain = filters.sort === "fit"
  const warmKey = useMemo(
    () => [
      "jobFeedWarm", token, targetLocationSignature(targetLocations), q, skill ?? "",
      filters.roleDomain ?? "", filters.followingOnly, filters.includeStretch,
    ] as const,
    [token, targetLocations, q, skill, filters.roleDomain, filters.followingOnly, filters.includeStretch],
  )
  const warm = useQuery({
    queryKey: warmKey,
    queryFn: () =>
      jobs.warmFeed(token, {
        cluster: filters.roleDomain,
        q: q || null,
        skill: skill || null,
        followingOnly: filters.followingOnly,
        includeStretch: filters.includeStretch,
      }),
    enabled: !!token && gateOnBrain,
    staleTime: 30 * 60 * 1000, // matches the server-side eval cache window
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  })
  // Hold the feed until the brain has warmed (or errored/timed out). On "Newest"
  // there's no ranking to wait for, so it paints immediately.
  const brainReady = !gateOnBrain || warm.isSuccess || warm.isError
  const warming = gateOnBrain && !brainReady

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
    enabled: !!token && brainReady,
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
  const total = Math.max(0, ...(feed.data?.pages.map((page) => page.available_total) ?? [0]))
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
    const last = feed.data?.pages.at(-1)
    if (last && last.returned_total === 0 && feed.hasNextPage && !feed.isFetchingNextPage) {
      void feed.fetchNextPage()
    }
  }, [feed])

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
      if (kind === "saved") setSavedCount(c => c + 1)
      const call = kind === "saved" ? jobs.saveJob(token, job.job_id) : jobs.skipJob(token, job.job_id)
      const operation = call.then(() => true).catch(() => {
        // Roll back the optimistic drain on failure so the card isn't lost.
        void qc.invalidateQueries({ queryKey })
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
      if (!committed) return qc.invalidateQueries({ queryKey })
      const reverse = kind === "saved" ? jobs.removeTrackerJob(token, jobId) : jobs.unskipJob(token, jobId)
      return reverse.then(() => qc.invalidateQueries({ queryKey })).catch(() => qc.invalidateQueries({ queryKey }))
    })
    if (kind === "saved") setSavedCount(c => Math.max(0, c - 1))
    setPending(null)
  }, [pending, token, qc, queryKey, clearUndoTimer])

  useEffect(() => clearUndoTimer, [clearUndoTimer])

  return { feed, allJobs, total, rankedCount, warming, expansionDividers, triage, undo, pending, commitPending, savedCount }
}
