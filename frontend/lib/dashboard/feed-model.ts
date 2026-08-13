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

/** A saved / self-discovered job has no JobMatch — synthesise one from the
 *  list-endpoint's first-class card fields so a tracked job renders the SAME
 *  FeedCard (skill chips / location / meta) as a Myro match, not an empty body.
 *  Mirrors JobIndex.synthMatch. */
export function synthMatch(app: ApplicationResponse): JobMatch {
  return {
    id: app.id,
    job_id: app.job_id,
    title: app.title,
    company: app.company,
    location: app.location ?? null,
    location_city: app.location_city ?? null,
    location_country: app.location_country ?? null,
    location_mode: app.location_mode ?? null,
    locations: app.locations ?? [],
    remote: app.location_mode === "remote" || app.work_mode === "remote",
    overlap_score: 0,
    // A saved / self-found job carries no Match Verdict — neutral, never shown
    // (FeedItem.fit is null for non-matches).
    match_score: 0,
    verdict: "checking",
    is_strong: false,
    llm_rank: null,
    llm_explanation: null,
    batch_week: "",
    source_url: app.source_url ?? null,
    matched_skills: app.matched_skills ?? [],
    missing_skills: app.missing_skills ?? [],
    job_summary: app.job_summary ?? null,
    job_description: app.job_description ?? null,
    date_posted: app.date_posted ?? null,
    seniority_level: app.seniority_level ?? null,
    work_mode: app.work_mode ?? null,
    min_years_experience: app.min_years_experience ?? null,
    max_years_experience: app.max_years_experience ?? null,
  }
}

const LIKED_STATUSES: ReadonlySet<ApplicationStatus> = new Set<ApplicationStatus>([
  "saved",
  "applied",
  "interviewing",
])

// ── Triage context ──────────────────────────────────────────────────────────
// What the folder needs to know about a row's COMMITMENT state. It used to also
// carry followedCompanies + targetRoles to feed a `prize × winnability` ranker —
// a second fit score computed in the client, competing with the server's Match
// Verdict for the same question. Deleted 2026-08-13: one number orders every
// surface. Those two signals are TARGETING facts and belong in the Targeting
// Brief, where the brain reads them into the verdict itself — not in a
// multiplier applied after the ranking is already done.

/** Everything the folder's commitment split needs — all derived from signals we already hold. */
export interface TriageContext {
  tailoredJobIds: ReadonlySet<string>       // jobs with a tailored CV (cv_badge present)
  committedJobIds: ReadonlySet<string>      // jobs the user has applied to / beyond
}

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
      // The Match Verdict number (brain-spined + overlap-gated), not raw overlap.
      fit: j.match_score,
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

/** Sort axis — orthogonal to the source Segment. "Best fit" sorts by the
 *  overlap score the fit ring renders (desc), so the visible order always
 *  matches the visible scores. The API's incoming order is NOT assumed sorted. */
export type SortKey = "fit" | "recent" | "company"

/** "Best fit" is the Match Verdict — the ONE fit answer, computed server-side.
 *  The others are not competing claims about fit; they are different questions
 *  (when, who) with honest labels. "Best next" used to sit here as a fourth
 *  option ranking by `prize × winnability`, a client-side fit score that could
 *  disagree with the number printed on the very card it was ordering. */
export const SORTS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: "fit", label: "Best fit" },
  { key: "recent", label: "Most recent" },
  { key: "company", label: "Company A–Z" },
]

export function sortItems(items: FeedItem[], sort: SortKey): FeedItem[] {
  const arr = [...items]
  if (sort === "fit") {
    // Sort by the same overlap score the ring renders, desc. Liked-only rows
    // (fit === null) have no score → sink last. Stable sort keeps build order
    // (matches before liked) within a tie.
    return arr.sort((a, b) => (b.fit ?? -1) - (a.fit ?? -1))
  }
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
