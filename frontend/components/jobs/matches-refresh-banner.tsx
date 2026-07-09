"use client"

import { useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import "@/components/dashboard/dashboard.css"
import { MatchRefreshGate } from "@/components/jobs/MatchRefreshGate"
import { useJobRefresh } from "@/lib/hooks/use-job-refresh"
import { useParticleMoment } from "@/components/particle"
import { jobs, users } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { withLocalCache, userCacheKey } from "@/lib/local-cache"
import { JOB_MATCHES_CACHE_PARTS } from "@/lib/job-matches-cache"

const MATCHES_TTL = 7 * 24 * 60 * 60 * 1000

/**
 * Refresh host on Jobs (/market). The "N new jobs" signal + the Refresh trigger
 * now live in the Loop Bar's Capture step (one glanceable place in the nav), so
 * this component owns the rest of the flow:
 *   - keeps the shared matches cache (dataKeys.jobs()) warm — the Loop Bar reads
 *     new_jobs_count + fit from it passively; this is that cache's only populator
 *     on /market;
 *   - hosts the consent gate (opened from the Loop Bar badge via openRefreshGate);
 *   - shows in-progress status and fires the every-successful-refresh celebration.
 */
export function MatchesRefreshBanner({ token }: { token: string | null }) {
  const queryClient = useQueryClient()
  const refreshVm = useJobRefresh(token, queryClient)
  const fireMoment = useParticleMoment()

  // Warms dataKeys.jobs(); the Loop Bar's Capture "N new" badge + "next" fit read
  // this cache. Called for its cache side-effect (the bar is the renderer now).
  useQuery({
    queryKey: dataKeys.jobs(),
    queryFn: () =>
      withLocalCache(userCacheKey(token!, JOB_MATCHES_CACHE_PARTS), MATCHES_TTL, () => jobs.matches(token!)),
    enabled: !!token,
    staleTime: MATCHES_TTL,
  })
  const { data: profile } = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => users.me(token!),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  })

  // Celebration fires on the done-transition, only when matches were actually
  // written (a "0 new" finish never fakes a payoff). Ref guards the edge.
  const firedRef = useRef(false)
  useEffect(() => {
    if (refreshVm.state === "done" && (refreshVm.matchesWritten ?? 0) > 0) {
      if (!firedRef.current) {
        firedRef.current = true
        fireMoment({ intensity: 1.4 })
      }
    } else {
      firedRef.current = false
    }
  }, [refreshVm.state, refreshVm.matchesWritten, fireMoment])

  const isRefreshing = refreshVm.state === "charging" || refreshVm.state === "computing"

  return (
    <>
      {isRefreshing && refreshVm.progressLabel ? (
        <div className="db db-stale" style={{ marginTop: 14 }} role="status" aria-live="polite">
          <span>{refreshVm.progressLabel}</span>
        </div>
      ) : null}
      <MatchRefreshGate token={token} profile={profile} onRun={() => refreshVm.refresh()} />
    </>
  )
}
