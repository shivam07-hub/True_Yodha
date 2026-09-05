"use client"

import { useQuery } from "@tanstack/react-query"
import { jobs as jobsApi, type CollectionResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"

/**
 * Live journey counts on the nav tabs. The nav IS the journey, so each stage tab
 * carries the one number that says how much of the pipeline sits there.
 *
 * These are the Collection Record's `stages{}`, read straight through — the
 * resolver owns the counts (CONTEXT.md → Collection Record). They used to be
 * derived here from the applications cache while the Collections chips derived
 * their own from a different one, so the badge counted rows the surface then
 * hid (closed listings) and disagreed with the chip beside them.
 */

export interface JourneyCounts {
  /** Saved roles still in play — collected, not yet tailored or applied. */
  collected: number
  /** Of those, how many already have a tailored CV. THE goal-line number. */
  tailored: number
  /** Live prep rooms — applied and beyond. */
  liveRooms: number
}

export function deriveJourneyCounts(collection: CollectionResponse): JourneyCounts {
  const { stages } = collection
  return {
    // `found` is not collected — nothing has been claimed yet. It is Myro's
    // offer, and counting it here made the badge promise work the user had
    // never agreed to do.
    collected: stages.saved ?? 0,
    tailored: stages.tailored ?? 0,
    liveRooms: stages.applied ?? 0,
  }
}

/** null until the collection cache has data — tabs render count-less, never 0-flash. */
export function useJourneyCounts(): JourneyCounts | null {
  const { token } = useAuth()
  const { data } = useQuery({
    queryKey: dataKeys.collection(),
    // Passive: Collections owns and seeds this read. The token still has to be
    // the real one — it was hardcoded to "" here, which is inert only for as
    // long as nobody ever flips `enabled` or calls refetchQueries on this key,
    // and would then send `Authorization: Bearer ` and 401.
    queryFn: () => jobsApi.collection(token!),
    enabled: false,
    staleTime: 60 * 1000,
  })
  return data ? deriveJourneyCounts(data) : null
}
