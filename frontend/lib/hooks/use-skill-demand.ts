"use client"

import { useQuery } from "@tanstack/react-query"
import { jobs, type SkillDemandCityItem, type SkillDemandItem, type SkillDemandWindow } from "@/lib/api"

// Stable refs: `query.data` is undefined until the first fetch resolves, so a
// fallback literal here would mint a new array every render — looping any
// effect that lists the returned value in its dependency array.
const EMPTY_SKILLS: SkillDemandItem[] = []
const EMPTY_CITIES: SkillDemandCityItem[] = []

/**
 * Skills a city is actually hiring for, from the precomputed snapshot.
 *
 * One hook for all three consumers (rail panel, mobile chip strip, feed story
 * card) so they can never quote different numbers for the same city — which is
 * how the surface it replaced ended up with a role count nobody could source.
 *
 * Public: no token, no CV. The answer is the market, identical for every viewer.
 */
export function useSkillDemand(
  city: string | null,
  window: SkillDemandWindow = "30d",
  // The Jobs page enables this at its turn in the automatic rail cascade.
  enabled = true,
  limit = 8,
) {
  const key = (city ?? "").trim()
  const query = useQuery({
    queryKey: ["skillDemand", key, window, limit],
    queryFn: () => jobs.skillDemand(key, window, limit),
    enabled: enabled && !!key,
    staleTime: 30 * 60 * 1000,
  })
  return {
    skills: query.data?.skills ?? EMPTY_SKILLS,
    computedAt: query.data?.computed_at ?? null,
    // False when there is nothing to fetch, so a city we don't cover renders an
    // empty state rather than a skeleton that never resolves.
    loading: query.isLoading && enabled && !!key,
    settled: enabled && (!key || query.isSuccess || query.isError),
  }
}

/** Cities the snapshot covers, largest market first. */
export function useSkillDemandCities(enabled = true) {
  const query = useQuery({
    queryKey: ["skillDemandCities"],
    queryFn: () => jobs.skillDemandCities(),
    enabled,
    staleTime: 6 * 60 * 60 * 1000,
  })
  return {
    cities: query.data?.cities ?? EMPTY_CITIES,
    loading: query.isLoading && enabled,
    settled: enabled && (query.isSuccess || query.isError),
  }
}
