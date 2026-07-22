import type { FeedFilters } from "./feed-types"

export function targetLocationSignature(targetLocations: string[]): string {
  return targetLocations
    .map((location) => location.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("|")
}

export function jobFeedQueryKey({
  token,
  filters,
  q,
  skill,
  targetLocations,
}: {
  token: string
  filters: FeedFilters
  q: string
  skill: string | null
  targetLocations: string[]
}) {
  // Only SERVER filters key the query. `hideLowConfidence` is view-scope
  // (applied to the fetched page in `applyViewFilters`), so toggling it must
  // not evict the cache and re-fetch.
  return [
    "jobFeed",
    token,
    targetLocationSignature(targetLocations),
    q,
    skill ?? "",
    filters.sort,
    filters.roleDomain ?? "",
    filters.minSkillMatches,
    filters.followingOnly,
    filters.includeStretch,
    filters.locationMode ?? "",
  ] as const
}
