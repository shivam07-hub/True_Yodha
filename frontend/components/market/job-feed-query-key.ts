import type { FeedScope } from "@/lib/feed-scope"
import type { FeedFilters } from "./feed-types"

export function jobFeedQueryKey({
  token,
  filters,
  q,
  skill,
  scope,
}: {
  token: string
  filters: FeedFilters
  q: string
  skill: string | null
  scope: FeedScope
}) {
  // Only SERVER filters key the query. `hideLowConfidence` is view-scope
  // (applied to the fetched page in `applyViewFilters`), so toggling it must
  // not evict the cache and re-fetch.
  return [
    "jobFeed",
    token,
    scope.signature,
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
