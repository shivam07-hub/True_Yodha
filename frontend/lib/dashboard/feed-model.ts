import type {
  ApplicationResponse,
  ApplicationStatus,
  JobMatch,
} from "@/lib/api"

export type Segment = "myro" | "liked" | "all"

/** One job in the unified dashboard stack — a Myro match or a liked/self-found job. */
export interface FeedItem {
  jobId: string
  company: string | null
  role: string
  fit: number | null
  isMatch: boolean
  isLiked: boolean
  job: JobMatch
}

/** A saved / self-discovered job has no JobMatch — synthesise a minimal one so it
 *  still renders through the same card. Mirrors JobIndex.synthMatch. */
export function synthMatch(app: ApplicationResponse): JobMatch {
  return {
    id: app.id,
    job_id: app.job_id,
    title: app.title,
    company: app.company,
    location: null,
    remote: false,
    overlap_score: 0,
    llm_rank: null,
    llm_explanation: null,
    batch_week: "",
    source_url: null,
    matched_skills: [],
    job_description: app.job_description ?? null,
  }
}

const LIKED_STATUSES: ReadonlySet<ApplicationStatus> = new Set<ApplicationStatus>([
  "saved",
  "applied",
  "screening",
  "interviewing",
  "final_round",
])

/** Build the single continuous stack: every Myro match, then any liked job not
 *  already a match. Q1-B graceful degrade — matches first, then Liked. */
export function buildFeed(
  jobs: JobMatch[],
  apps: ApplicationResponse[],
  dismissedJobIds: ReadonlySet<string> = new Set(),
): { items: FeedItem[]; likedIds: Set<string> } {
  const likedIds = new Set<string>()
  for (const a of apps) {
    if (dismissedJobIds.has(a.job_id)) continue
    if (a.source === "user_discovery" || LIKED_STATUSES.has(a.status)) likedIds.add(a.job_id)
  }

  const items: FeedItem[] = []
  const seen = new Set<string>()
  for (const j of jobs) {
    if (dismissedJobIds.has(j.job_id)) continue
    seen.add(j.job_id)
    items.push({
      jobId: j.job_id,
      company: j.company,
      role: j.title,
      fit: Math.round(j.overlap_score),
      isMatch: true,
      isLiked: likedIds.has(j.job_id),
      job: j,
    })
  }
  for (const a of apps) {
    if (dismissedJobIds.has(a.job_id)) continue
    if (seen.has(a.job_id)) continue
    if (!(a.source === "user_discovery" || LIKED_STATUSES.has(a.status))) continue
    seen.add(a.job_id)
    items.push({
      jobId: a.job_id,
      company: a.company,
      role: a.title,
      fit: null,
      isMatch: false,
      isLiked: true,
      job: synthMatch(a),
    })
  }
  return { items, likedIds }
}

export function segmentCounts(items: FeedItem[]): Record<Segment, number> {
  return {
    myro: items.filter((i) => i.isMatch).length,
    liked: items.filter((i) => i.isLiked).length,
    all: items.length,
  }
}

export function filterSegment(items: FeedItem[], segment: Segment): FeedItem[] {
  if (segment === "myro") return items.filter((i) => i.isMatch)
  if (segment === "liked") return items.filter((i) => i.isLiked)
  return items
}

/** Sort axis — orthogonal to the source Segment. "Best fit" preserves the
 *  canonical incoming order (LLM/overlap rank from the API), so it is the
 *  zero-cost default that matches today's behaviour. */
export type SortKey = "fit" | "recent" | "company"

export const SORTS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: "fit", label: "Best fit" },
  { key: "recent", label: "Most recent" },
  { key: "company", label: "Company A–Z" },
]

export function sortItems(items: FeedItem[], sort: SortKey): FeedItem[] {
  // Best fit = the order buildFeed produced (matches in API rank, then liked).
  if (sort === "fit") return items
  const arr = [...items]
  if (sort === "company") {
    return arr.sort((a, b) =>
      (a.company ?? "￿").localeCompare(b.company ?? "￿", undefined, { sensitivity: "base" }),
    )
  }
  // recent = first_seen (discovery age) desc; rows without a timestamp sink last.
  return arr.sort((a, b) => {
    const ta = a.job.first_seen ? new Date(a.job.first_seen).getTime() : 0
    const tb = b.job.first_seen ? new Date(b.job.first_seen).getTime() : 0
    return tb - ta
  })
}

/** Fit tiers drive colour — a low fit must NOT read as a branded badge of
 *  honour (D9). strong = accent, mid = neutral ink, low = muted. */
export type FitTier = "strong" | "mid" | "low"

export function fitTier(fit: number): FitTier {
  if (fit >= 65) return "strong"
  if (fit >= 40) return "mid"
  return "low"
}

/** Slide / lens identity, shared by mobile (horizontal slides) + desktop (tabs). */
export type LensKey = "overview" | "why" | "skills" | "company" | "notes"

export const LENSES: ReadonlyArray<{ key: LensKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "why", label: "Why you fit" },
  { key: "skills", label: "Skills" },
  { key: "company", label: "Company" },
  { key: "notes", label: "Notes" },
]
