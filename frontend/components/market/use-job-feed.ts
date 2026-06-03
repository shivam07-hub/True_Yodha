"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query"
import { jobs, type JobFeedItem, type JobFeedResponse } from "@/lib/api"
import type { FeedFilters } from "./feed-types"

export type TriageKind = "saved" | "skipped"

export interface PendingUndo {
  jobId: string
  kind: TriageKind
  job: JobFeedItem
}

const UNDO_MS = 5000

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
}: {
  token: string
  filters: FeedFilters
  q: string
}) {
  const qc = useQueryClient()
  const [pending, setPending] = useState<PendingUndo | null>(null)
  const [savedCount, setSavedCount] = useState(0)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const queryKey = useMemo(
    () => [
      "jobFeed", token, q, filters.sort, filters.roleDomain ?? "",
      filters.minSkillMatches, filters.targetRoleOnly, filters.freshnessDays, filters.followingOnly,
    ],
    [token, q, filters],
  )

  const feed = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam = 1 }) =>
      jobs.feed(token, {
        // roleDomain holds the selected target-role cluster label; the backend
        // resolves it to jobs.role_domain (passing it raw would skip resolution).
        cluster: filters.roleDomain,
        q: q || null,
        sort: filters.sort,
        minSkillMatches: filters.minSkillMatches,
        targetRoleOnly: filters.targetRoleOnly,
        freshnessDays: filters.freshnessDays,
        followingOnly: filters.followingOnly,
        page: pageParam,
        pageSize: 20,
      }),
    initialPageParam: 1,
    getNextPageParam: last => (last.has_next_page ? last.page + 1 : undefined),
    enabled: !!token,
    staleTime: 30 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  })

  const allJobs = useMemo(() => feed.data?.pages.flatMap(p => p.jobs) ?? [], [feed.data])
  const total = feed.data?.pages[0]?.available_total ?? 0

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
      void call.catch(() => {
        // Roll back the optimistic drain on failure so the card isn't lost.
        void qc.invalidateQueries({ queryKey })
        if (kind === "saved") setSavedCount(c => Math.max(0, c - 1))
      })
      setPending({ jobId: job.job_id, kind, job })
      undoTimer.current = setTimeout(() => setPending(null), UNDO_MS)
    },
    [qc, queryKey, token, clearUndoTimer],
  )

  const undo = useCallback(() => {
    if (!pending) return
    const { jobId, kind } = pending
    clearUndoTimer()
    const reverse = kind === "saved" ? jobs.removeTrackerJob(token, jobId) : jobs.unskipJob(token, jobId)
    void reverse
      .then(() => qc.invalidateQueries({ queryKey }))
      .catch(() => qc.invalidateQueries({ queryKey }))
    if (kind === "saved") setSavedCount(c => Math.max(0, c - 1))
    setPending(null)
  }, [pending, token, qc, queryKey, clearUndoTimer])

  useEffect(() => clearUndoTimer, [clearUndoTimer])

  return { feed, allJobs, total, triage, undo, pending, commitPending, savedCount }
}
