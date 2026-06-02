/**
 * useHomeBootstrap — the BFF seam for the dashboard.
 *
 * Fires ONE request (`GET /home/bootstrap`) and seeds every dashboard query's
 * TanStack cache entry from the bundle. The home page gates its leaf queries on
 * this hook settling, so on a cold load the dashboard paints from a single
 * round-trip instead of ~7 parallel calls (LinkedIn BFF pattern).
 *
 * Seeding happens synchronously inside the queryFn before it resolves, so by
 * the time `isSuccess` flips the cache is already warm — a gated leaf query
 * then reads fresh cache and never hits the network.
 *
 * Resilient: if the bootstrap call errors, the hook still "settles", leaf
 * queries re-enable and fetch on their own (the pre-BFF behaviour). The BFF is
 * an optimisation, never a single point of failure.
 *
 * Shared keys (profile, cv-versions) are seeded too, so the app shell + nav
 * unlocks read warm cache once their own in-flight fetch resolves — full
 * dedup of those app-wide hooks is a separate refinement (they must not couple
 * to a home-only bootstrap).
 */

import { useQuery, useQueryClient } from "@tanstack/react-query"

import { home } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"

const BOOTSTRAP_STALE_TIME = 60 * 1000

export function useHomeBootstrap(token: string | null | undefined) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ["home-bootstrap", token],
    queryFn: async () => {
      const data = await home.bootstrap(token!)

      // Seed each section's cache entry before resolving. Gated leaf queries
      // read these instead of fetching.
      queryClient.setQueryData(dataKeys.profile(), data.profile)
      if (data.score) queryClient.setQueryData(dataKeys.scores(), data.score)
      queryClient.setQueryData(dataKeys.jobs(), data.matches)
      queryClient.setQueryData(dataKeys.applications(), data.applications)
      queryClient.setQueryData(dataKeys.cvEvidence(), data.evidence)
      queryClient.setQueryData(dataKeys.cvVersions(null), data.cv_versions)
      queryClient.setQueryData(dataKeys.diary(), data.diary)
      queryClient.setQueryData(["forge-session-dates", token], data.forge_dates)

      return data
    },
    enabled: !!token,
    staleTime: BOOTSTRAP_STALE_TIME,
  })

  // Settled = the gate is open. Either the bundle landed (cache warm) or it
  // failed (leaf queries fall back to fetching themselves).
  const settled = query.isSuccess || query.isError

  return { settled, ...query }
}
