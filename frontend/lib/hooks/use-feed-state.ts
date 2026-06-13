"use client"

import { useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { jobs, type FeedState } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"

/**
 * Feed publication sensing (Job Intelligence).
 *
 * Detects a newly published jobs feed cheaply via a conditional ETag request —
 * no standing realtime connection. The publication clock is global, so the
 * ETag and last-known state live in module memory (not the query cache) so a
 * 304 can reuse the prior value instead of nulling it.
 *
 * Refresh cadence (handoff): mount + window focus + reconnect + every five
 * minutes while visible. React Query's default focus/reconnect refetch covers
 * the first two; refetchIntervalInBackground:false pauses the interval while
 * the tab is hidden, satisfying "do not poll while hidden".
 */

let _feedEtag: string | null = null
let _feedState: FeedState | null = null

const FIVE_MIN = 5 * 60 * 1000

export function useFeedState() {
  const { token } = useAuth()
  const queryClient = useQueryClient()
  const lastVersion = useRef<string | null>(null)

  const query = useQuery({
    queryKey: dataKeys.feedState(),
    enabled: !!token,
    queryFn: async () => {
      const res = await jobs.feedState(token!, _feedEtag)
      if (res.status === "fresh") {
        _feedEtag = res.etag
        _feedState = res.data
      }
      return _feedState
    },
    refetchInterval: FIVE_MIN,
    refetchIntervalInBackground: false,
    staleTime: 0,
  })

  // When the publication version advances, the live market listings changed —
  // invalidate the free market feed so it re-fetches. Personalized matches are
  // NOT auto-invalidated: re-ranking them costs Myro Coins through the existing
  // refresh gate, and we never auto-charge.
  const version = query.data?.feed_version ?? null
  useEffect(() => {
    if (!version) return
    if (lastVersion.current === null) {
      lastVersion.current = version
      return
    }
    if (version !== lastVersion.current) {
      lastVersion.current = version
      // Market triage feed key (components/market/use-job-feed.ts).
      queryClient.invalidateQueries({ queryKey: ["jobFeed"] })
    }
  }, [version, queryClient])

  return query
}

/**
 * True when new jobs were published after the user's personalized matches were
 * last computed — i.e. the dashboard should OFFER (not auto-run) a refresh.
 */
export function isFeedAheadOfMatches(
  feed: FeedState | null | undefined,
  matchesComputedAt: string | null | undefined,
): boolean {
  if (!feed?.published_at || !matchesComputedAt) return false
  return new Date(feed.published_at).getTime() > new Date(matchesComputedAt).getTime()
}
