"use client"

import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { jobs } from "@/lib/api"
import type { FeedScope } from "@/lib/feed-scope"
import type { FeedFilters } from "./feed-types"
import { jobFeedQueryKey } from "./job-feed-query-key"

/**
 * The deferred brain warm for the triage feed — J1, never J0.
 *
 * Why this is a separate hook and not two lines inside `useJobFeed`: the warm is a
 * blocking-judgment LLM call. 3799e114 removed it from the feed hook because it was
 * wait-then-paint, and locked that in with the "Jobs paints its J0 feed before
 * secondary compute" contract test, which asserts `use-job-feed.ts` contains no
 * `jobs.warmFeed`. c73aa23a put it back while consolidating something unrelated and
 * left Develop failing that test. Keeping the warm in its own module is what makes
 * the guard meaningful instead of a string the next refactor trips over by accident.
 *
 * What was left behind by that removal: nothing warmed on arrival at all, so a
 * first-time user under "Best fit" got pure deterministic overlap under a label
 * promising the brain's ranking. `ranked_count` was 0 and the feed had no way to
 * ever become ranked except by opening cards one at a time.
 *
 * The gate is **J0 having settled**, not browser idle. ARCHITECTURE_READ_PATH's
 * journey-compute contract is explicit that "the browser is idle" is not a user
 * decision, and `useIdleWave`'s own comment records idle firing while J0 was still
 * in flight on Safari/WebViews. `settled` comes from the feed query itself.
 *
 * Fires at most once per (filters, scope, query) key. On resolve with new evals it
 * invalidates exactly that feed key, so the feed re-reads and the top cards arrive
 * carrying verdicts, ordered best-first. Warming nothing invalidates nothing — a
 * re-read that cannot change the answer is pure cost.
 *
 * Only under the "Best fit" rank. `POST /feed/warm` always ranks the fit-top
 * shortlist regardless of the caller's sort, so warming under "Newest" would spend
 * a judgment-lane call on cards the user has not asked to be ranked and — since
 * `_rank_feed_rows` no longer reorders outside `fit` — would not change their order
 * anyway.
 */
export function useFeedWarm({
  token,
  filters,
  q,
  skill,
  scope,
  settled,
  enabled = true,
}: {
  token: string
  filters: FeedFilters
  q: string
  skill: string | null
  scope: FeedScope
  /** J0 has painted — the feed query has produced a result (or failed). */
  settled: boolean
  enabled?: boolean
}) {
  const qc = useQueryClient()
  const [warming, setWarming] = useState(false)
  // Keys already attempted this mount. A warm is idempotent server-side, but a
  // repeat still costs a round trip and, on a miss, a judgment-lane call.
  const attempted = useRef<Set<string>>(new Set())

  const queryKey = jobFeedQueryKey({ token, filters, q, skill, scope })
  const signature = JSON.stringify(queryKey)

  useEffect(() => {
    if (!enabled || !token || !settled) return
    if (filters.sort !== "fit") return
    if (attempted.current.has(signature)) return
    attempted.current.add(signature)

    let cancelled = false
    setWarming(true)
    void jobs
      .warmFeed(token, {
        cluster: filters.roleDomain,
        q: q || null,
        skill: skill || null,
        locationMode: filters.locationMode,
        followingOnly: filters.followingOnly,
        includeStretch: filters.includeStretch,
      })
      .then((res) => {
        // Cancelled = the user changed filters or left. Re-reading a feed they are
        // no longer looking at wastes a request and can clobber the new one.
        if (cancelled) return
        if (res.warmed > 0) void qc.invalidateQueries({ queryKey })
      })
      .finally(() => {
        if (!cancelled) setWarming(false)
      })

    return () => {
      cancelled = true
    }
    // `signature` stands in for queryKey (a fresh array each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, token, settled, filters.sort, signature])

  return { warming }
}
