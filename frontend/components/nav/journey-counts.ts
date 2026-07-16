"use client"

import { useQuery } from "@tanstack/react-query"
import { jobs as jobsApi, type ApplicationResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import { isApplied } from "@/lib/collections/model"

/**
 * Live journey counts on the nav tabs (unified-structure S1). The nav IS the
 * journey now — the Loop Bar strip is gone — so each stage tab carries the one
 * number that says how much of the user's pipeline sits there:
 *
 *   Collections — saved roles still in play (not yet applied)
 *   CV          — of those, how many already have a tailored CV
 *   Prep        — live rooms (applied + interviewing)
 *
 * One cheap read: the shared applications cache (same dataKeys.applications the
 * Collections surface and the Prep attention pill use) — never a new endpoint.
 */

export interface JourneyCounts {
  collected: number
  tailored: number
  liveRooms: number
}

export function deriveJourneyCounts(apps: ApplicationResponse[]): JourneyCounts {
  const inPlay = apps.filter((a) => !isApplied(a))
  return {
    collected: inPlay.length,
    tailored: inPlay.filter((a) => a.cv_badge).length,
    liveRooms: apps.filter((a) => a.status === "applied" || a.status === "interviewing").length,
  }
}

/** null until the applications cache has data — tabs render count-less, never 0-flash. */
export function useJourneyCounts(): JourneyCounts | null {
  const { token } = useAuth()
  const { data } = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobsApi.applications(token!),
    enabled: !!token,
    staleTime: 60 * 1000,
  })
  return data ? deriveJourneyCounts(data) : null
}
