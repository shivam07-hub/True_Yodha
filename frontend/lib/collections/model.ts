import type { ApplicationResponse, JobMatch } from "@/lib/api"
import {
  scoreItem,
  synthMatch,
  sortItems,
  type FeedItem,
  type SortKey,
  type TriageContext,
} from "@/lib/dashboard/feed-model"

/* ── Collections view-model — the "Myro Ops" folder ───────────────────────────
 * Collections = the Myro Ops folder, successor of the retired /home dashboard.
 * Two data spines:
 *   · "Myro found"  → the brain match stack (jobs.matches / user_job_matches),
 *      THRESHOLD-split (above-bar shown here, below-bar → Jobs, rejected hidden).
 *   · "You added" / "Applied" → the saved-job worklist (jobs.applications).
 * The pinned "Finish tailoring" lane (tailored-not-applied) is chip-independent.
 * One model, two skins (desktop rows / mobile cards).
 * ────────────────────────────────────────────────────────────────────────── */

export type CollectionChip = "all" | "found" | "added" | "applied"

export const COLLECTION_CHIPS: ReadonlyArray<{ key: CollectionChip; label: string }> = [
  { key: "all", label: "All" },
  { key: "found", label: "Myro found" },
  { key: "added", label: "You added" },
  { key: "applied", label: "Applied" },
]

/** Desktop Myro Ops folder chips — "All" is dropped (the folder lands on Myro
 *  found, and All blurred the match-stack ↔ applications split). */
export const FOLDER_CHIPS: ReadonlyArray<{ key: CollectionChip; label: string }> = [
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

/** Chip counts. When `foundCount` is passed (the Myro Ops folder), "Myro found"
 *  is the above-bar brain match count from the match stack; otherwise it falls
 *  back to the application-source count (loop-bar / legacy consumers). */
export function chipCounts(
  apps: ApplicationResponse[],
  foundCount?: number,
): Record<CollectionChip, number> {
  return {
    all: apps.length,
    found: foundCount ?? apps.filter((a) => isMyroSource(a.source) && !isApplied(a)).length,
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

/* ── Myro Found — the brain match stack, THRESHOLD-split ──────────────────────
 * A Myro Search evaluates the whole candidate pool; the results split three ways:
 *   · ABOVE the quality bar → shown in this folder (Agent Picks pinned above).
 *   · BELOW the bar         → fall through to Jobs (/market), ranked.
 *   · REJECTED              → excluded (for-cause Skip / scam-tier legitimacy).
 * Trust = the judgment, not the volume — an honest split, never a padded list.
 * ────────────────────────────────────────────────────────────────────────── */

export type MatchBucket = "above" | "below" | "rejected"

// Quality bar = grade B- and up. Tunable — the one place the cut lives.
const GRADE_RANK: Record<string, number> = {
  "A+": 12, A: 11, "A-": 10,
  "B+": 9, B: 8, "B-": 7,
  "C+": 6, C: 5, "C-": 4,
  D: 2, F: 0,
}
const BAR_GRADE_RANK = GRADE_RANK["B-"]

function gradeRank(grade?: string | null): number | null {
  if (!grade) return null
  // Providers sometimes emit "B- / B" — take the first valid token (learning #11).
  const token = grade.trim().split(/[\s/,|]+/)[0]?.toUpperCase() ?? ""
  return token in GRADE_RANK ? GRADE_RANK[token] : null
}

/** Which bucket a brain match falls into. The rejected judgment is the anti-junk
 *  call the deterministic sieve can't make (Rishabh's 7/10 honest Skips). */
export function classifyMatch(m: JobMatch): MatchBucket {
  if ((m.legitimacy_tier ?? "").toLowerCase() === "suspicious") return "rejected"
  if ((m.recommendation ?? "").toLowerCase() === "skip") return "rejected"

  // Brain grade cut (B- and up) when the job was evaluated.
  const rank = gradeRank(m.grade)
  if (rank != null) return rank >= BAR_GRADE_RANK ? "above" : "below"

  // No brain grade yet (overlap-only rows) — fall back to the Match Verdict spine.
  if (m.is_strong || m.verdict === "strong" || m.verdict === "worth_it") return "above"
  return "below"
}

/** A brain match as a FeedItem for the card body — real fit, never faked. */
export function matchToFeedItem(m: JobMatch): FeedItem {
  return {
    jobId: m.job_id,
    company: m.company,
    role: m.title,
    fit: m.match_score > 0 ? m.match_score : null,
    isMatch: true,
    isLiked: false,
    job: m,
  }
}

export interface MyroFoundView {
  /** Above-bar matches, best-fit first — Agent-Pick + dismissed ids excluded. */
  found: FeedItem[]
  /** Ranked below the bar → live on Jobs. */
  belowBarCount: number
  /** Rejected for cause — dead listing, wrong level, off deal-breakers. */
  rejectedCount: number
}

/**
 * Split the match stack. `pickedIds` are already pinned in the Agent Picks band
 * (don't repeat them); `dismissedIds` are hidden from the folder entirely and
 * count toward nothing.
 */
export function buildMyroFound(
  matches: JobMatch[] | undefined,
  dismissedIds: ReadonlySet<string>,
  pickedIds: ReadonlySet<string>,
): MyroFoundView {
  const found: FeedItem[] = []
  let belowBarCount = 0
  let rejectedCount = 0
  for (const m of matches ?? []) {
    if (dismissedIds.has(m.job_id)) continue
    const bucket = classifyMatch(m)
    if (bucket === "rejected") { rejectedCount += 1; continue }
    if (bucket === "below") { belowBarCount += 1; continue }
    if (pickedIds.has(m.job_id)) continue // shown in the Agent Picks band already
    found.push(matchToFeedItem(m))
  }
  found.sort((a, b) => (b.fit ?? -1) - (a.fit ?? -1))
  return { found, belowBarCount, rejectedCount }
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

/** The chip-independent "Finish tailoring" lane — every tailored, not-yet-
 *  applied saved job, best-next first. Pinned above the folder on every chip. */
export function buildContinueLane(
  apps: ApplicationResponse[],
  ctx: TriageContext,
  byId: Map<string, JobMatch>,
): FeedItem[] {
  const rank = (it: FeedItem) => scoreItem(it, ctx).rank
  return apps
    .filter((a) => a.cv_badge && !isApplied(a))
    .map((a) => appToFeedItem(a, byId.get(a.job_id)))
    .sort((a, b) => rank(b) - rank(a))
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
