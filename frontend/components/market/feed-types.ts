import type { JobFeedItem } from "@/lib/api"

/**
 * The narrowing the user can do to their own list. One object so the
 * orchestrator, the filters sheet and the query hook share a single source of
 * truth — and, since 2026-07-22, so that desktop and mobile narrow through the
 * SAME contract. (Mobile used to carry a private two-filter fork that could not
 * reach the server filters at all.)
 *
 * **Every filter here is a VIEW filter now**, applied to cards already in hand.
 * That is not a downgrade, it is what a finite list makes true: retrieval returns
 * up to forty jobs chosen for this person, so narrowing them is instant and needs
 * no round trip. It also removes the thing that made the old sheet dishonest —
 * server filters implied corpus-wide counts while the feed underneath them was a
 * 500-row sample of one shared date.
 *
 * What went, and why it is not missing:
 *   * `sort` — a chosen list has one order. "Best fit ⇄ Newest" was ranking a
 *     sample, and the fit composite that powered it is deleted.
 *   * `roleDomain` — the cluster pin the server resolved to a `jobs.role_domain`.
 *     The role chips remain, narrowing by `role_family` in the browser: the same
 *     affordance, no round trip, and no second vocabulary to keep in step.
 *   * `minSkillMatches` — every card already shares a skill or a direction.
 *   * `includeStretch` — level is a range-overlap rule in SQL, not a toggle.
 *   * `followingOnly` — a card does not know whether you follow its company, and
 *     inventing a second read to narrow forty cards is the wrong trade. If it
 *     comes back it comes back as a field on the card.
 *
 * Location (city/country) is NOT here either — it is fixed-from-settings, scoped
 * inside retrieval, surfaced read-only in the sheet, never a per-session filter.
 */
export type LocationMode = "onsite" | "hybrid" | "remote"

export interface FeedFilters {
  /** One of the user's own target roles, narrowing the list to that family. The
   *  chips are written in the same vocabulary as `jobs.role_family`, which is what
   *  retrieval matched on, so the chip and the card agree by construction. */
  roleFamily: string | null
  locationMode: LocationMode | null  // null = any work mode
  hideLowConfidence: boolean         // drop caution/suspicious/stale cards
}

export const DEFAULT_FILTERS: FeedFilters = {
  roleFamily: null,
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

/**
 * The filter set, built structurally off DEFAULT_FILTERS so a newly added filter
 * is carried by every consumer automatically. Hand-listing the fields here is how
 * mobile ended up unable to reach half of them.
 */
export function localFilters(source: Partial<FeedFilters> | undefined): FeedFilters {
  return { ...DEFAULT_FILTERS, ...(source ?? {}) }
}

/** Count of active filters — drives the "Filters · N" badge. The role chips are
 *  their own always-visible row, so they are not counted here. */
export function activeFilterCount(f: FeedFilters): number {
  let n = 0
  if (f.locationMode) n += 1
  if (f.hideLowConfidence) n += 1
  return n
}

/** The filters, cleared. The settings-owned location scope is untouched. */
export function resetFilters(f: FeedFilters): FeedFilters {
  return { ...f, roleFamily: null, locationMode: null, hideLowConfidence: false }
}

/** Free text and an active skill chip. Separate from `FeedFilters` because the
 *  page owns them in the URL, not the sheet — but they narrow the same way. */
export interface ViewQuery {
  q?: string
  skill?: string | null
}

/**
 * The ONE client-side pass over the list, so both skins inherit it — a skin that
 * filtered locally is how desktop and mobile drifted apart.
 *
 * Everything here is honestly view-scoped, and the sheet says so rather than
 * implying a corpus-wide count. `hideLowConfidence` reads `legitimacy_tier` from
 * the cached brain eval joined onto the cards AFTER retrieval, plus `is_stale`
 * derived from the listing marker at read time — neither exists in the corpus to
 * filter on. The rest could be SQL predicates, but narrowing forty cards the
 * browser already holds does not deserve a round trip.
 *
 * `q` searches the list, not the corpus: "find the Google one among my forty".
 * Corpus-wide search is a different act and it is ⌘K (`/jobs/search/global`,
 * trigram over title + company). Sending this `q` to retrieval would have meant
 * filtering a chosen list by title and calling the remainder a shortlist.
 */
export function applyViewFilters<
  T extends Pick<
    JobFeedItem,
    "legitimacy_tier" | "is_stale" | "location_mode" | "role_family"
    | "job_title" | "company_name" | "skills"
  >,
>(items: T[], f: FeedFilters, view: ViewQuery = {}): T[] {
  let out = items
  if (f.hideLowConfidence) {
    out = out.filter(
      j => !(j.legitimacy_tier === "caution" || j.legitimacy_tier === "suspicious" || j.is_stale),
    )
  }
  if (f.locationMode) out = out.filter(j => j.location_mode === f.locationMode)
  if (f.roleFamily) out = out.filter(j => j.role_family === f.roleFamily)
  if (view.skill) {
    const want = view.skill.toLowerCase()
    out = out.filter(j => (j.skills ?? []).some(s => s.toLowerCase() === want))
  }
  const term = (view.q ?? "").trim().toLowerCase()
  if (term) {
    out = out.filter(
      j =>
        j.job_title.toLowerCase().includes(term) ||
        (j.company_name ?? "").toLowerCase().includes(term),
    )
  }
  return out
}
