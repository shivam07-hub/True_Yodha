import type { JobFeedItem, JobMatch } from "@/lib/api"

/** A skill pill on a feed card. `matched` = the user's CV covers it (✓ accent). */
export interface FeedChip {
  name: string
  matched?: boolean
}

/**
 * What a card shows in its top-right fit slot. ONE canonical view-model so every
 * surface renders the same `<FitIndicator>` — the ring-vs-pill choice is decided
 * HERE in the adapter (locality), not smeared across each surface's call site.
 *
 * The two surfaces carry genuinely different fit signals: the dashboard has a
 * 0–100 match score (donut ring), the market feed has only skill-overlap counts
 * (success pill / honest nudge). Both reduce to this union.
 */
export type FitView =
  | { kind: "score"; value: number } // 0–100 overlap/LLM fit → donut ring (dashboard)
  | { kind: "overlap"; count: number } // N matched skills → success pill (market, has CV)
  | { kind: "role" } // target-role match, no skill overlap → quiet pill
  | { kind: "none" } // CV present, nothing matched → "no overlap yet"
  | { kind: "nudge" } // no CV → upload prompt
  | null // nothing to show in the slot

/** Market `JobFeedItem` skill signals → FitView. Mirrors the old FeedFitPill logic. */
function marketFit(
  job: Pick<JobFeedItem, "matched_skill_count" | "target_role_match">,
  hasCv: boolean,
): FitView {
  if (!hasCv) return { kind: "nudge" }
  if (job.matched_skill_count > 0) return { kind: "overlap", count: job.matched_skill_count }
  if (job.target_role_match > 0) return { kind: "role" }
  return { kind: "none" }
}

/**
 * The normalized shape every feed card renders from. Both the market feed
 * (`JobFeedItem`) and the dashboard feed (`JobMatch`) adapt into this one model
 * so a single presentational `<FeedCard>` serves every surface.
 */
export interface FeedCardData {
  jobId: string
  company: string | null
  role: string
  locations: string[]
  location: string | null
  locationMode: string | null
  sourceUrl: string | null
  datePosted: string | null
  seniority: string | null
  minYears: number | null
  maxYears: number | null
  snippet: string
  chips: FeedChip[]
  /** Skills beyond the shown chips → rendered as a `+N` overflow pill. */
  extraChipCount: number
  ageIso: string | null
  /** The top-right fit slot view-model. The card renders `<FitIndicator>` from it. */
  fit: FitView
}

/** Compact relative-age badge from an ISO date (day granular). */
export function ageLabel(iso: string | null | undefined): string | null {
  if (!iso) return null
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return null
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000)
  if (days <= 0) return "today"
  if (days === 1) return "1d ago"
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

/** Experience-range chip label from the scraper's min/max years (backlog #22). */
export function experienceLabel(min: number | null, max: number | null): string | null {
  if (min != null && max != null) return min === max ? `${min} yrs` : `${min}–${max} yrs`
  if (min != null) return `${min}+ yrs`
  if (max != null) return `≤${max} yrs`
  return null
}

/** One fading body line. Inlined here (not imported from lenses) so the card
 *  stays free of the lens module's heavy streaming/XP dependencies. */
function snippetOf(text: string | null | undefined, max = 200): string {
  if (!text) return ""
  // Strip Markdown emphasis/heading marks — raw scraper summaries carry `**bold**`,
  // `_em_`, `` `code` ``, leading `#`/`>` that otherwise leak into the card body.
  const plain = text
    .replace(/[*_`~]+/g, "")
    .replace(/^\s*[#>\-]+\s?/gm, "")
  const flat = plain.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat
}

/** Dashboard `JobMatch` (+ feed wrapper fields) → FeedCardData. */
export function feedDataFromMatch(
  src: { jobId: string; company: string | null; role: string; job: JobMatch; fit?: number | null },
  opts: { maxChips?: number; snippetMax?: number } = {},
): FeedCardData {
  const { job } = src
  const maxChips = opts.maxChips ?? 3
  const allChips = job.matched_skills ?? []
  return {
    jobId: src.jobId,
    company: src.company,
    role: src.role,
    locations: (job.locations ?? []).filter((c) => c && c.trim()),
    location: job.location?.trim() || null,
    locationMode: normalizeMode(job.location_mode, job.work_mode),
    sourceUrl: job.source_url ?? null,
    datePosted: job.date_posted?.trim() || null,
    seniority: job.seniority_level?.trim() || null,
    minYears: job.min_years_experience ?? null,
    maxYears: job.max_years_experience ?? null,
    snippet: snippetOf(job.job_summary?.trim() || job.job_description, opts.snippetMax),
    chips: allChips.slice(0, maxChips).map((name) => ({ name, matched: true })),
    extraChipCount: Math.max(0, allChips.length - maxChips),
    ageIso: job.first_seen ?? null,
    fit: src.fit != null ? { kind: "score", value: src.fit } : null,
  }
}

/** Market `JobFeedItem` → FeedCardData. */
export function feedDataFromFeedItem(
  job: JobFeedItem,
  opts: { maxChips?: number; snippetMax?: number; hasCv?: boolean } = {},
): FeedCardData {
  const maxChips = opts.maxChips ?? 3
  return {
    jobId: job.job_id,
    company: job.company_name,
    role: job.job_title,
    locations: (job.locations ?? []).filter((c) => c && c.trim()),
    location: job.location?.trim() || null,
    locationMode: normalizeMode(job.location_mode, null),
    sourceUrl: job.source_url ?? null,
    datePosted: null,
    seniority: null,
    minYears: null,
    maxYears: null,
    snippet: snippetOf(job.job_description, opts.snippetMax),
    chips: job.skills.slice(0, maxChips).map((name) => ({ name })),
    extraChipCount: Math.max(0, job.skills.length - maxChips),
    ageIso: job.first_seen ?? null,
    fit: marketFit(job, opts.hasCv ?? false),
  }
}

function normalizeMode(
  scalar: JobMatch["location_mode"],
  work: string | null | undefined,
): string | null {
  if (scalar && scalar !== "unknown") return scalar
  const w = work?.trim().toLowerCase()
  return w && w !== "unknown" ? w : null
}
