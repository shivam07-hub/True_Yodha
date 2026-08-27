"use client"

import { useCallback } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
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
 * ONE DOOR, two landings. `run()` opens on the slots ("here is what I will
 * search for"); `tellMyro()` opens on the say band ("something is off"). Both
 * are the same modal against the same Order — /market used to render them as
 * two buttons side by side, which read as two products.
 *
 * Usage:
 *   const { run, tellMyro, isRefreshing, refreshVm, gate } = useMyroSearch(token)
 *   // render your button → onClick={run} disabled={isRefreshing}
 *   // mount {gate} once in the tree
 */
export function useMyroSearch(token: string | null) {
  const router = useRouter()
  const refreshVm = useJobRefresh(token)
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

  // Zero-arg on purpose. `openRefreshGate` takes an intent, and handing it
  // straight to an onClick passed the MouseEvent in as one — the modal would
  // have landed wherever a click object happened to compare to.
  const run = useCallback(() => openRefreshGate("review"), [])
  const tellMyro = useCallback(() => openRefreshGate("say"), [])

  return { run, tellMyro, isRefreshing, refreshVm, profile, gate }
}
