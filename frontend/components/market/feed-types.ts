import type { JobFeedSort } from "@/lib/api"

/**
 * The user's rank toggle + narrowing filters for the triage feed. One object so
 * the orchestrator, the filters sheet and the query hook share a single source
 * of truth.
 *
 * Ranking (market filter rework, locked 2026-06-05): the four legacy sort pills
 * collapse to a single visible toggle — "Best fit" (the `fit` composite, blends
 * skill·role·fresh server-side) ⇄ "Newest" (`fresh`). The skill/role signals
 * live INSIDE the fit score, never as separate user-picked sorts.
 *
 * Filters are the hard inclusion gates: roleDomain (cluster pin), minSkillMatches
 * (optional floor, default off), followingOnly, and explicit seniority stretch.
 * Location is NOT here — it is
 * fixed-from-settings server-side (the feed scopes to the user's saved target
 * locations), surfaced read-only in the summary line, never a per-session filter.
 */
export interface FeedFilters {
  sort: JobFeedSort
  roleDomain: string | null   // a target-role cluster pin
  minSkillMatches: number     // 0 = off
  followingOnly: boolean
  includeStretch: boolean     // explicit adjacent-level expansion
}

export const DEFAULT_FILTERS: FeedFilters = {
  sort: "fit",
  roleDomain: null,
  minSkillMatches: 0,
  followingOnly: false,
  includeStretch: false,
}

/** The two-way rank toggle. "Best fit" is hidden when the user has neither a CV
 *  nor target roles — there is no signal to rank fit on, so we default to Newest
 *  and don't offer a hollow fit mode. */
export const SORT_TOGGLE: { key: Extract<JobFeedSort, "fit" | "fresh">; label: string }[] = [
  { key: "fit", label: "Best fit" },
  { key: "fresh", label: "Newest" },
]

/** Can the "Best fit" rank produce a meaningful order for this user? */
export function canRankByFit(hasCv: boolean, hasTargetRoles: boolean): boolean {
  return hasCv || hasTargetRoles
}

/** The default rank for a user: fit when there's signal, else newest. */
export function pickDefaultSort(hasCv: boolean, hasTargetRoles: boolean): JobFeedSort {
  return canRankByFit(hasCv, hasTargetRoles) ? "fit" : "fresh"
}

/** Count of active narrowing filters — drives the "Filters · N" badge. Only the
 *  three surviving hard filters count; rank (fit/newest) is not a filter. */
export function activeFilterCount(f: FeedFilters): number {
  let n = 0
  if (f.roleDomain) n += 1
  if (f.minSkillMatches > 0) n += 1
  if (f.followingOnly) n += 1
  if (f.includeStretch) n += 1
  return n
}
