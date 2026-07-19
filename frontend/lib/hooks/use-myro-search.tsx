"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { users } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { openRefreshGate } from "@/store/refreshGateStore"
import { useJobRefresh } from "@/lib/hooks/use-job-refresh"
import { MatchRefreshGate } from "@/components/jobs/MatchRefreshGate"

/**
 * The one wiring for a Myro Search (the paid re-vet run), shared by every
 * surface that offers it — desktop /market, mobile /market, desktop Collections,
 * mobile Collections. Each surface renders its OWN trigger button (a desktop
 * chip, a mobile pill — presentation is allowed to differ) but the machinery
 * behind it — the refresh VM, the profile the gate seeds from, the consent gate
 * bound to that same VM, and the in-flight flag — is identical everywhere and
 * lives HERE, not copy-pasted per call site.
 *
 * Usage:
 *   const { run, isRefreshing, refreshVm, gate } = useMyroSearch(token)
 *   // render your button → onClick={run} disabled={isRefreshing}
 *   // mount {gate} once in the tree
 *
 * `refreshVm` is returned so a surface can layer its own progress/celebration
 * on the run (e.g. /market's particle moment) without re-wiring the core. The
 * button and the gate share one VM instance, so `isRefreshing` always reflects
 * the actual run.
 */
export function useMyroSearch(token: string | null) {
  const queryClient = useQueryClient()
  const refreshVm = useJobRefresh(token, queryClient)
  const { data: profile } = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => users.me(token!),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  })

  const isRefreshing = refreshVm.state === "charging" || refreshVm.state === "computing"

  const gate = <MatchRefreshGate token={token} profile={profile} onRun={() => refreshVm.refresh()} />

  return { run: openRefreshGate, isRefreshing, refreshVm, profile, gate }
}
