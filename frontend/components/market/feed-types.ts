import type { JobFeedItem, JobFeedSort } from "@/lib/api"

/**
 * The user's rank toggle + narrowing filters for the triage feed. One object so
 * the orchestrator, the filters sheet and the query hook share a single source
 * of truth — and, since 2026-07-22, so that desktop and mobile narrow the feed
 * through the SAME contract. (Mobile used to carry a private two-filter fork
 * that could not reach the server filters at all; see `applyViewFilters`.)
 *
 * Ranking (market filter rework, locked 2026-06-05): the four legacy sort pills
 * collapse to a single visible toggle — "Best fit" (the `fit` composite, blends
 * skill·role·fresh server-side) ⇄ "Newest" (`fresh`). The skill/role signals
 * live INSIDE the fit score, never as separate user-picked sorts.
 *
 * Filters are the hard inclusion gates: roleDomain (cluster pin), minSkillMatches
 * (optional floor, default off), followingOnly, explicit seniority stretch, and
 * locationMode (on-site/hybrid/remote). All of those are SERVER filters — the
 * backend applies them, so counts and pagination stay honest.
 * `hideLowConfidence` is the one VIEW filter: it reads the per-job brain eval
 * that is joined onto the page after the query, so it can only be applied to
 * what was fetched (see `applyViewFilters`).
 *
 * Location (city/country) is NOT here — it is fixed-from-settings server-side
 * (the feed scopes to the user's saved target locations), surfaced read-only in
 * the sheet, never a per-session filter.
 */
export type LocationMode = "onsite" | "hybrid" | "remote"

export interface FeedFilters {
  sort: JobFeedSort
  roleDomain: string | null   // a target-role cluster pin
  minSkillMatches: number     // 0 = off
  followingOnly: boolean
  includeStretch: boolean     // explicit adjacent-level expansion
  locationMode: LocationMode | null  // null = any work mode
  hideLowConfidence: boolean  // view-scope: drop caution/suspicious/stale cards
}

export const DEFAULT_FILTERS: FeedFilters = {
  sort: "fit",
  roleDomain: null,
  minSkillMatches: 0,
  followingOnly: false,
  includeStretch: false,
  locationMode: null,
  hideLowConfidence: false,
}

/** The work-mode segmented control. "Any" is the null state, not a value. */
export const WORK_MODES: ReadonlyArray<readonly [LocationMode | null, string]> = [
  [null, "Any"],
  ["onsite", "On-site"],
  ["hybrid", "Hybrid"],
  ["remote", "Remote"],
] as const

export function parseLocationMode(raw: string | null | undefined): LocationMode | null {
  const v = (raw ?? "").trim().toLowerCase()
  return v === "onsite" || v === "hybrid" || v === "remote" ? v : null
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

/**
 * The filter set minus the role pin (which the page owns as `?cluster`), built
 * structurally off DEFAULT_FILTERS so a newly added filter is carried by every
 * consumer automatically. Hand-listing the fields here is how mobile ended up
 * unable to reach half of them.
 */
export function localFilters(
  source: Partial<FeedFilters> | undefined,
  fallbackSort: JobFeedSort,
): Omit<FeedFilters, "roleDomain"> {
  const merged: FeedFilters = { ...DEFAULT_FILTERS, ...(source ?? {}), sort: source?.sort ?? fallbackSort }
  const rest: Partial<FeedFilters> = { ...merged }
  delete rest.roleDomain
  return rest as Omit<FeedFilters, "roleDomain">
}

/** Count of active narrowing filters — drives the "Filters · N" badge. Rank
 *  (fit/newest) is not a filter, so it never counts. */
export function activeFilterCount(f: FeedFilters): number {
  let n = 0
  if (f.roleDomain) n += 1
  if (f.minSkillMatches > 0) n += 1
  if (f.followingOnly) n += 1
  if (f.includeStretch) n += 1
  if (f.locationMode) n += 1
  if (f.hideLowConfidence) n += 1
  return n
}

/** The narrowing filters, cleared. Rank + the settings-owned location scope are
 *  deliberately preserved — Reset narrows nothing, it does not re-sort. */
export function resetFilters(f: FeedFilters): FeedFilters {
  return {
    ...f,
    roleDomain: null,
    minSkillMatches: 0,
    followingOnly: false,
    includeStretch: false,
    locationMode: null,
    hideLowConfidence: false,
  }
}

/**
 * The ONE client-side pass over a fetched page.
 *
 * `hideLowConfidence` cannot be a server filter: `legitimacy_tier` comes from
 * the cached brain eval that is joined onto each page AFTER the query, and
 * `is_stale` is derived from the listing marker at read time. So this is
 * honestly view-scoped — it hides cards from what was fetched, and the sheet
 * says so rather than implying a corpus-wide count.
 *
 * Everything else in `FeedFilters` is applied by the backend.
 */
export function applyViewFilters<T extends Pick<JobFeedItem, "legitimacy_tier" | "is_stale">>(
  items: T[],
  f: Pick<FeedFilters, "hideLowConfidence">,
): T[] {
  if (!f.hideLowConfidence) return items
  return items.filter(j => !(j.legitimacy_tier === "caution" || j.legitimacy_tier === "suspicious" || j.is_stale))
}
