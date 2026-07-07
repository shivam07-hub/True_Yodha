"use client"

import { useEffect, useMemo, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import "@/components/dashboard/dashboard.css"
import { Button } from "@/components/ui/button"
import { MatchRefreshGate } from "@/components/jobs/MatchRefreshGate"
import { openRefreshGate } from "@/store/refreshGateStore"
import { useJobRefresh } from "@/lib/hooks/use-job-refresh"
import { useParticleMoment } from "@/components/particle"
import { jobs, users } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { withLocalCache, userCacheKey } from "@/lib/local-cache"
import { JOB_MATCHES_CACHE_PARTS } from "@/lib/job-matches-cache"

const MATCHES_TTL = 7 * 24 * 60 * 60 * 1000

/**
 * Match staleness + coin-charged recompute, relocated from the retired /home
 * dashboard onto Jobs (/market) — the browse surface owns discovery mechanics.
 * Self-contained: reads the shared matches cache, shows the honest "N new jobs
 * since your last match" line (jobs.first_seen newer than the user's last
 * compute — the ONLY real staleness signal), opens the consent gate, runs the
 * refresh, and keeps the every-successful-refresh celebration (WOW #4).
 */
export function MatchesRefreshBanner({ token }: { token: string | null }) {
  const queryClient = useQueryClient()
  const refreshVm = useJobRefresh(token, queryClient)
  const fireMoment = useParticleMoment()

  const { data: jobsData } = useQuery({
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
  const newJobsCount = jobsData?.new_jobs_count ?? 0
  const stale = useMemo(
    () => !!(jobsData?.total ?? 0) && newJobsCount > 0,
    [jobsData, newJobsCount],
  )

  return (
    <>
      {stale && !isRefreshing ? (
        <div className="db db-stale" style={{ marginTop: 14 }}>
          <span>
            {newJobsCount} new {newJobsCount === 1 ? "job" : "jobs"} since your last match — results may be outdated.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={openRefreshGate}
            className="shrink-0 !text-[var(--tm-warning)] !border-[var(--tm-warning)] hover:!bg-[var(--tm-warning-wash)]"
          >
            Refresh now
          </Button>
        </div>
      ) : null}
      {isRefreshing && refreshVm.progressLabel ? (
        <div className="db db-stale" style={{ marginTop: 14 }} role="status" aria-live="polite">
          <span>{refreshVm.progressLabel}</span>
        </div>
      ) : null}
      <MatchRefreshGate token={token} profile={profile} onRun={() => refreshVm.refresh()} />
    </>
  )
}
