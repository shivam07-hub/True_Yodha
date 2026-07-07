import type { ApplicationResponse, JobMatch } from "@/lib/api"
import {
  scoreItem,
  synthMatch,
  sortItems,
  type FeedItem,
  type SortKey,
  type TriageContext,
} from "@/lib/dashboard/feed-model"

/* ── Collections view-model ──────────────────────────────────────────────────
 * Collections = the SAVED-job worklist (jobs.applications), the successor of
 * the retired /home dashboard. One model, two skins (desktop rows / mobile
 * cards): source chips, the pinned "Finish tailoring" lane (tailored-not-
 * applied, the strongest worklist mechanic the old dashboard had), and the
 * prize×winnability triage order ported from the dashboard feed-model.
 * ────────────────────────────────────────────────────────────────────────── */

export type CollectionChip = "all" | "found" | "added" | "applied"

export const COLLECTION_CHIPS: ReadonlyArray<{ key: CollectionChip; label: string }> = [
  { key: "all", label: "All" },
  { key: "found", label: "Myro found" },
  { key: "added", label: "You added" },
  { key: "applied", label: "Applied" },
]

/** A saved row Myro discovered (match feed / system) vs one the user brought. */
export function isMyroSource(src: string): boolean {
  const s = src.toLowerCase()
  return s.includes("system") || s.includes("myro") || s.includes("match") || s.includes("feed")
}

export function isExtSource(src: string): boolean {
  const s = src.toLowerCase()
  return s.includes("ext") || s.includes("chrome")
}

/** Anything past "saved" is committed — it lives under the Applied chip. */
export const isApplied = (a: ApplicationResponse) => a.status !== "saved"

export function chipCounts(apps: ApplicationResponse[]): Record<CollectionChip, number> {
  return {
    all: apps.length,
    found: apps.filter((a) => isMyroSource(a.source) && !isApplied(a)).length,
    added: apps.filter((a) => !isMyroSource(a.source) && !isApplied(a)).length,
    applied: apps.filter(isApplied).length,
  }
}

export function filterChip(apps: ApplicationResponse[], chip: CollectionChip): ApplicationResponse[] {
  if (chip === "found") return apps.filter((a) => isMyroSource(a.source) && !isApplied(a))
  if (chip === "added") return apps.filter((a) => !isMyroSource(a.source) && !isApplied(a))
  if (chip === "applied") return apps.filter(isApplied)
  return apps
}

/** Fit signal joined from the cached match stack — score/verdict only when the
 *  brain has actually evaluated the job (never fake a ring). */
export function matchesById(matches: JobMatch[] | undefined): Map<string, JobMatch> {
  const m = new Map<string, JobMatch>()
  for (const j of matches ?? []) m.set(j.job_id, j)
  return m
}

/** An application as a dashboard FeedItem: synthMatch for the card body, the
 *  real match (when the brain evaluated this job) for fit/verdict/why-fit. */
export function appToFeedItem(a: ApplicationResponse, match: JobMatch | undefined): FeedItem {
  const job = match ?? synthMatch(a)
  const fit = match?.match_score ?? null
  return {
    jobId: a.job_id,
    company: a.company,
    role: a.title,
    fit: fit != null && fit > 0 ? fit : null,
    isMatch: isMyroSource(a.source),
    isLiked: true,
    job,
  }
}

export interface CollectionsView {
  /** Tailored but not applied — pinned "Finish tailoring" lane. */
  continueItems: FeedItem[]
  /** Everything else in the current chip, ranked. */
  queueItems: FeedItem[]
}

/**
 * Order the current chip's rows. Default "prize" = the dashboard triage rank
 * (prize×winnability, ⭐ followed / 🎯 target-role boosted) with applied rows
 * sunk to the bottom — they're done, not next. The continue lane is extracted
 * only outside the Applied chip (an applied job has nothing left to finish).
 */
export function buildCollectionsView(
  apps: ApplicationResponse[],
  chip: CollectionChip,
  sort: SortKey,
  ctx: TriageContext,
  byId: Map<string, JobMatch>,
): CollectionsView {
  const shown = filterChip(apps, chip)
  const items = shown.map((a) => appToFeedItem(a, byId.get(a.job_id)))

  const continueItems: FeedItem[] = []
  const rest: FeedItem[] = []
  for (const it of items) {
    if (chip !== "applied" && ctx.tailoredJobIds.has(it.jobId) && !ctx.committedJobIds.has(it.jobId)) {
      continueItems.push(it)
    } else {
      rest.push(it)
    }
  }

  const rank = (it: FeedItem) => scoreItem(it, ctx).rank
  continueItems.sort((a, b) => rank(b) - rank(a))

  let queueItems: FeedItem[]
  if (sort === "prize") {
    queueItems = rest.sort((a, b) => {
      const aDone = ctx.committedJobIds.has(a.jobId) ? 1 : 0
      const bDone = ctx.committedJobIds.has(b.jobId) ? 1 : 0
      if (aDone !== bDone) return aDone - bDone // applied sinks
      return rank(b) - rank(a)
    })
  } else {
    queueItems = sortItems(rest, sort)
  }
  return { continueItems, queueItems }
}

/** Build the triage context from the same signals the dashboard used. */
export function collectionsTriageCtx(
  apps: ApplicationResponse[],
  followedCompanies: string[],
  targetRoles: string[],
): TriageContext {
  const tailoredJobIds = new Set<string>()
  const committedJobIds = new Set<string>()
  for (const a of apps) {
    if (a.cv_badge) tailoredJobIds.add(a.job_id)
    if (isApplied(a)) committedJobIds.add(a.job_id)
  }
  return {
    followedCompanies: new Set(followedCompanies.map((c) => c.toLowerCase().trim())),
    targetRoles,
    tailoredJobIds,
    committedJobIds,
  }
}

/** Chip-scoped empty copy — never a blanket "nothing here" when the emptiness
 *  has a nameable cause (ported from the dashboard's scoped empty states). */
export function emptyCopy(chip: CollectionChip): string {
  switch (chip) {
    case "found":
      return "No Myro-found roles saved yet — save one from Jobs and it lands here."
    case "added":
      return "Nothing added by you yet — paste a link, or send roles from the Chrome extension."
    case "applied":
      return "No applications yet — tailor a saved role, then apply."
    default:
      return "Nothing here yet — save roles from Jobs, paste a link, or send them from the Chrome extension."
  }
}
