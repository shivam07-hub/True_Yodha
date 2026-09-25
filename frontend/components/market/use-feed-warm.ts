"use client"

import { useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { jobs, type JobFeedResponse } from "@/lib/api"
import type { FeedScope } from "@/lib/feed-scope"
import { useLaneYields } from "@/store/matchRunStore"
import { jobFeedQueryKey } from "./job-feed-query-key"

const POLL_MS = 15_000
const POLL_CAP = 12 // ~3 min. The warm measures ~100s; the extra polls cover a wait on the fast lane.

/**
 * The deferred brain warm for the triage feed — J1, never J0.
 *
 * Why this is a separate hook and not two lines inside `useJobFeed`: the warm
 * used to be a blocking-judgment LLM call. 3799e114 removed it from the feed
 * hook because it was wait-then-paint, and locked that in with the "Jobs paints
 * its J0 feed before secondary compute" contract test, which asserts
 * `use-job-feed.ts` contains no `jobs.warmFeed`.
 *
 * What that removal left behind, and what putting the call back as a 7s POST
 * did not fix: the ranking takes ~100s and the client abandoned it, so
 * `ranked_count` stayed 0 and the list painted retrieval order as if it were
 * ranked. The POST now only enqueues `feed_warm`. This hook re-reads the feed
 * while that job can still be running and the list is entirely unread — once
 * any row is read, the divider already says where the unread ones start, and
 * another feed read on a 30-minute staleTime is not what surfaces them.
 *
 * The gate to START is J0 having settled, not a timer and not browser idle.
 * The re-read interval belongs to the query, and it only runs after the
 * enqueue has been accepted.
 */
export function useFeedWarm({
  token,
  scope,
  settled,
  enabled = true,
}: {
  token: string
  scope: FeedScope
  /** J0 has painted — the feed query has produced a result (or failed). */
  settled: boolean
  enabled?: boolean
}) {
  const qc = useQueryClient()
  const yieldLane = useLaneYields()
  const [warming, setWarming] = useState(false)
  const [watching, setWatching] = useState(false)
  // Keys already accepted this mount. A yielded call is NOT recorded — ranking
  // owns the judgment lane, and a shed warm must retry after.
  const attempted = useRef<Set<string>>(new Set())
  const polls = useRef(0)

  const queryKey = jobFeedQueryKey({ token, scope })
  const signature = JSON.stringify(queryKey)

  useEffect(() => {
    if (yieldLane || !enabled || !token || !settled) return
    if (attempted.current.has(signature)) return

    let cancelled = false
    const ac = new AbortController()
    setWarming(true)
    void jobs
      .warmFeed(token, ac.signal)
      .then((res) => {
        if (cancelled) return
        if (!res.pending) return
        attempted.current.add(signature)
        const ranked = qc.getQueryData<JobFeedResponse>(queryKey)?.ranked_count ?? 0
        // A list that already has read rows draws the divider from ranked_count.
        // Polling it again is a feed read that cannot change that fact until the
        // worker lands, and a return visit is a cache hit.
        if (ranked > 0) return
        polls.current = 0
        setWatching(true)
      })
      .catch(() => {
        // The enqueue failed. Leave the key unrecorded so a later settle retries.
        // The list stays on `checking` — unread, not a fake ranking.
      })
      .finally(() => {
        if (!cancelled) setWarming(false)
      })

    return () => {
      cancelled = true
      ac.abort()
      setWarming(false)
      setWatching(false)
    }
    // `signature` stands in for queryKey (a fresh array each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, token, settled, signature, yieldLane])

  useQuery({
    queryKey: ["feed-warm-watch", signature],
    enabled: watching && !yieldLane,
    queryFn: async () => {
      polls.current += 1
      await qc.refetchQueries({ queryKey })
      return qc.getQueryData<JobFeedResponse>(queryKey)?.ranked_count ?? 0
    },
    refetchInterval: (query) => {
      if (polls.current >= POLL_CAP) return false
      const count = query.state.data
      if (typeof count === "number" && count > 0) return false
      return POLL_MS
    },
  })

  return { warming }
}
