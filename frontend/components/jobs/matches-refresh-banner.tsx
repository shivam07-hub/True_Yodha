"use client"

import { useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import "@/components/dashboard/dashboard.css"
import { useMyroSearch } from "@/lib/hooks/use-myro-search"
import { refreshIsLive } from "@/lib/hooks/use-job-refresh"
import { useParticleMoment } from "@/components/particle"
import { jobs, type MatchHealth } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { withLocalCache, userCacheKey } from "@/lib/local-cache"
import { JOB_MATCHES_CACHE_PARTS } from "@/lib/job-matches-cache"
import { openRefreshGate } from "@/store/refreshGateStore"
import { useLaneYields } from "@/store/matchRunStore"
import { NewInventoryStrip } from "./new-inventory-strip"

const MATCHES_TTL = 7 * 24 * 60 * 60 * 1000

/**
 * Myro Search host on Jobs (/market). Owns the whole new-inventory → search flow:
 *   - keeps the shared matches cache (dataKeys.jobs()) warm — the Next chip reads
 *     new_jobs_count + fit from it passively; this is that cache's only populator
 *     on /market;
 *   - renders the new-inventory strip (the visible half of the pull model: Myro
 *     ingests, the user is told, the user runs the search);
 *   - hosts the consent gate, including the ?search=1 deep-link handoff from the
 *     notification bell;
 *   - shows in-progress status and fires the every-successful-refresh celebration.
 */
export function MatchesRefreshBanner({ token }: { token: string | null }) {
  // Shared Myro Search wiring (VM + gate). This banner layers the /market-only
  // extras on top: the new-inventory strip, progress line, celebration.
  const { refreshVm, gate } = useMyroSearch(token)
  const fireMoment = useParticleMoment()
  const yieldLane = useLaneYields()

  // Warms dataKeys.jobs(); the Loop Bar's Capture "N new" badge + "next" fit read
  // this cache. Called for its cache side-effect (the bar is the renderer now) —
  // and here also for match_health (the Career-Ops vetting trust banner below).
  const { data: matchesData } = useQuery({
    queryKey: dataKeys.jobs(),
    queryFn: () =>
      withLocalCache(userCacheKey(token!, JOB_MATCHES_CACHE_PARTS), MATCHES_TTL, () => jobs.matches(token!)),
    enabled: !!token && !yieldLane,
    staleTime: MATCHES_TTL,
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

  const isRefreshing = refreshIsLive(refreshVm.state)

  // Deep-link handoff: the bell (and any off-market prompt) sends the user here
  // with ?search=1 because the gate only mounts on this page. Fires once, then
  // scrubs the param so a refresh or a back-nav doesn't reopen the modal.
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    if (params.get("search") !== "1") return
    params.delete("search")
    const qs = params.toString()
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""))
    openRefreshGate()
  }, [])

  return (
    <>
      {isRefreshing && refreshVm.progressLabel ? (
        <div className="db db-stale" style={{ marginTop: 14 }} role="status" aria-live="polite">
          <span>{refreshVm.progressLabel}</span>
        </div>
      ) : null}
      {!yieldLane ? <NewInventoryStrip token={token} /> : null}
      <MatchVettingBanner token={token} health={matchesData?.match_health} />
      {gate}
    </>
  )
}

/**
 * The honest Career-Ops vetting banner. When the matcher's LLM pass fails, the
 * user is either looking at un-vetted overlap picks (`overlap_only`) or an empty
 * feed that should have matched (`failed`). We say so — a silent degradation
 * depreciates trust — and offer a FREE re-vet (undelivered work ≠ paid refresh).
 * On retry we poll the matches cache until Career Ops lands a verdict.
 */
export function MatchVettingBanner({ token, health }: { token: string | null; health?: MatchHealth }) {
  const queryClient = useQueryClient()
  const [retrying, setRetrying] = useState(false)

  // While retrying, re-check the matches cache until health leaves the failed/
  // un-vetted states (Career Ops landed) or we time out — never spins forever.
  useEffect(() => {
    if (!retrying || !token) return
    let ticks = 0
    const id = window.setInterval(() => {
      ticks += 1
      queryClient.invalidateQueries({ queryKey: dataKeys.jobs() })
      if (ticks >= 15) {
        setRetrying(false)   // ~60s cap; the user can trigger again
      }
    }, 4000)
    return () => window.clearInterval(id)
  }, [retrying, token, queryClient])

  // Stop the poll the moment the feed becomes vetted (or is being computed).
  useEffect(() => {
    if (retrying && health && health !== "failed" && health !== "overlap_only") {
      setRetrying(false)
    }
  }, [retrying, health])

  const needsBanner = health === "overlap_only" || health === "failed"
  if (!needsBanner && !retrying) return null

  async function onRetry() {
    if (!token || retrying) return
    setRetrying(true)
    try {
      await jobs.retryMatches(token)
    } catch {
      setRetrying(false)   // let them try again; never leave a stuck spinner
    }
  }

  const failed = health === "failed"
  return (
    <div className="db db-stale db-vetting" style={{ marginTop: 14 }} role="status" aria-live="polite">
      <span>
        {retrying
          ? "Re-checking these with Myro Ops…"
          : failed
            ? "Myro Ops couldn’t rank your matches. Your matches aren’t AI-vetted yet."
            : "These matches aren’t AI-vetted yet — Myro Ops couldn’t finish."}
      </span>
      <button
        type="button"
        className="db-vetting-retry"
        onClick={onRetry}
        disabled={retrying}
      >
        {retrying ? "Retrying…" : "Retry — free"}
      </button>
    </div>
  )
}
