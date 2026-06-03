import type { JobFeedSort } from "@/lib/api"

/**
 * The user's fit lens (rank-by) + narrowing filters for the triage feed.
 * One object so the orchestrator, the filters sheet and the query hook share a
 * single source of truth. `personal` / `role` lenses + min_skill / target_role
 * filters all need a CV or target roles — gated in the UI, never fabricated.
 */
export interface FeedFilters {
  sort: JobFeedSort
  roleDomain: string | null   // a target-role cluster pin
  minSkillMatches: number     // 0 = off
  targetRoleOnly: boolean
  freshnessDays: number       // 0 = any age
  followingOnly: boolean
}

export const DEFAULT_FILTERS: FeedFilters = {
  sort: "fresh",
  roleDomain: null,
  minSkillMatches: 0,
  targetRoleOnly: false,
  freshnessDays: 0,
  followingOnly: false,
}

/** Fit lenses. `personal` + `role` are gated (need CV / target roles). */
export const FIT_LENSES: { key: JobFeedSort; label: string; needsCv?: boolean; needsRoles?: boolean }[] = [
  { key: "fresh", label: "Freshest first" },
  { key: "personal", label: "Best skill match", needsCv: true },
  { key: "role", label: "Best role match", needsRoles: true },
  { key: "company", label: "By company" },
]

export const FRESHNESS_PRESETS: { days: number; label: string }[] = [
  { days: 0, label: "Any time" },
  { days: 1, label: "Past 24 hours" },
  { days: 7, label: "Past week" },
  { days: 30, label: "Past month" },
]

/** Count of active narrowing filters — drives the "Filters · N" badge. */
export function activeFilterCount(f: FeedFilters): number {
  let n = 0
  if (f.roleDomain) n += 1
  if (f.minSkillMatches > 0) n += 1
  if (f.targetRoleOnly) n += 1
  if (f.freshnessDays > 0) n += 1
  if (f.followingOnly) n += 1
  return n
}

export function freshnessLabel(days: number): string {
  return FRESHNESS_PRESETS.find(p => p.days === days)?.label ?? "Any time"
}
