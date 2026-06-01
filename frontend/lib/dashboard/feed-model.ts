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

/** Slide / lens identity, shared by mobile (horizontal slides) + desktop (tabs). */
export type LensKey = "overview" | "why" | "skills" | "company" | "notes"

export const LENSES: ReadonlyArray<{ key: LensKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "why", label: "Why you fit" },
  { key: "skills", label: "Skills" },
  { key: "company", label: "Company" },
  { key: "notes", label: "Notes" },
]
