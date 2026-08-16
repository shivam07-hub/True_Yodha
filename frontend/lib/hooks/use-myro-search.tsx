"use client"

import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { users } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { openRefreshGate } from "@/store/refreshGateStore"
import { useJobRefresh, refreshIsLive } from "@/lib/hooks/use-job-refresh"
import { PreflightGate } from "@/components/preflight/preflight-gate"

/**
 * The one wiring for a Myro Search (the signed-off re-vet run), shared by every
 * surface that offers it — desktop /market, mobile /market, desktop Collections,
 * mobile Collections. Each surface renders its OWN trigger button (a desktop
 * chip, a mobile pill — presentation is allowed to differ) but the machinery
 * behind it — the refresh VM, the profile the gate seeds from, the pre-flight
 * bound to that same VM, and the in-flight flag — is identical everywhere and
 * lives HERE, not copy-pasted per call site.
 *
 * This is the "one page-level entry point" the pre-flight's design asks for: it
 * mounts the gate, holds no domain logic, and passes callbacks down. The order,
 * its lines and its prose all live below it in `lib/preflight/*`.
 *
 * Usage:
 *   const { run, isRefreshing, refreshVm, gate } = useMyroSearch(token)
 *   // render your button → onClick={run} disabled={isRefreshing}
 *   // mount {gate} once in the tree
 */
export function useMyroSearch(token: string | null) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const refreshVm = useJobRefresh(token, queryClient)
  const { data: profile } = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => users.me(token!),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  })

  const isRefreshing = refreshIsLive(refreshVm.state)

  const gate = (
    <PreflightGate
      token={token}
      refreshVm={refreshVm}
      onSeeMatches={() => router.push("/market")}
    />
  )

  return { run: openRefreshGate, isRefreshing, refreshVm, profile, gate }
}
