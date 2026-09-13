"use client"

import { useQuery } from "@tanstack/react-query"

import { onboarding, type CareerBandOption } from "@/lib/api"

/**
 * The four Career Bands with their counts — ONE query key for every surface.
 *
 * The band step, the filters sheet and Settings all render the same control, so
 * they share the cache rather than each holding their own copy of four rows that
 * change once per ingest. `staleTime` is long for the same reason: this is a
 * Tier-0 snapshot refreshed with the scrape, not a live count.
 *
 * `fit` is per-caller, so the key carries no user id only because every query
 * client here is already scoped to one signed-in person.
 */
export function useCareerBandOptions(token: string | null | undefined, enabled = true) {
  return useQuery<CareerBandOption[]>({
    queryKey: ["career-bands"],
    queryFn: () => onboarding.careerBands(token ?? ""),
    enabled: Boolean(token) && enabled,
    staleTime: 10 * 60_000,
  })
}
