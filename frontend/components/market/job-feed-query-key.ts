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
  ] as const
}
