import type { JobMatch } from "@/lib/api"

type Verdict = JobMatch["verdict"]

/**
 * The verdict WORD shown beside the Match number — the single source for the
 * words. Its tone (colour) is the CSS split-partner: `.fc-verdict-{verdict}` in
 * feed-card.css owns the colour, so verdict→tone lives in exactly one place.
 *
 * NULL for `checking`, and that is the point. `checking` used to read "Checking
 * fit…", which is a loading state — and a row can sit in it permanently: a run
 * keeps 20 rows per search and the brain deep-reads 8, so twelve are unread
 * until someone opens them. Nothing is checking. The market card already
 * side-stepped this by falling back to the overlap view; the mobile row did not
 * and rendered the word, so one surface said "Checking fit…" while the divider
 * above it said "Not read yet".
 *
 * Returning null rather than a string makes "a card must not claim a verdict it
 * does not have" a rule the compiler enforces, instead of one two callers each
 * had to remember — and one of them forgot.
 */
export function verdictLabel(v: Verdict): string | null {
  switch (v) {
    case "strong":
      return "Strong"
    case "worth_it":
      return "Worth it"
    case "stretch":
      return "Stretch"
    case "checking":
      return null
  }
}

/**
 * The canonical 0–100 fit NUMBER for a job/match — the brain-spined `match_score`
 * (overlap-gated). Falls back to `overlap_score` ONLY (also 0–100, the
 * deterministic pre-brain signal on a JobMatch). NEVER `overall_score` — that is
 * the 5-axis 0–5 average, a different scale; showing it as a percent is the
 * mobile scale bug Slice 3 (#36) closes. Every surface reads THIS, so "the fit
 * number" is decided once.
 */
export function matchFitScore(job: { match_score?: number | null; overlap_score?: number | null }): number {
  return job.match_score ?? job.overlap_score ?? 0
}

/**
 * The engineer's next move on a warmed card — the canonical verdict → "what to
 * do" (not "how good"). Read by Collections as the hero verb. The market card
 * does not print this as a second CTA — Save is the Jobs hero; gap chips are
 * already Practice. `null` when the brain hasn't ranked the card (checking /
 * un-warmed) — a browse row has no move. Gap count is caller-supplied so this
 * stays a pure verdict→intent map.
 */
export function verdictMove(
  v: Verdict | null | undefined,
  gapCount: number,
): { label: string; kind: "go" | "gap" } | null {
  if (!v || v === "checking") return null
  if (v === "strong" || v === "worth_it") return { label: "Tailor & apply", kind: "go" }
  if (gapCount > 0) return { label: `Close ${gapCount} gap${gapCount === 1 ? "" : "s"} first`, kind: "gap" }
  return { label: "A stretch for now", kind: "gap" }
}

/**
 * Frontend reads of the server-side Match Verdict (backend CONTEXT.md "Match
 * Verdict"). No surface re-derives "how good / is it strong" — the fusion lives
 * once in the backend seam; here we only select and rank by what it already
 * decided. Replaces the old `credible-recommendation.ts`, which re-encoded the
 * credibility rule in React AND coupled it to "has a tailored CV" (a separate
 * concern) — so a brand-new strong match with no tailored context was wrongly
 * excluded.
 */

/** The headline-worthy matches — `verdict === "strong"`. */
export function strongMatches(jobs: JobMatch[]): JobMatch[] {
  return jobs.filter((j) => j.is_strong)
}

/**
 * The ONE "your best match" every surface points at. Strong matches win; when
 * the user has none (fresher / thin market), fall back to the closest real job
 * by `match_score` — never an empty hand (the honest Stretch answer). Returns
 * null only when there are no matches at all.
 */
export function pickBestMatch(jobs: JobMatch[]): JobMatch | null {
  const strong = strongMatches(jobs)
  const pool = strong.length > 0 ? strong : jobs
  return [...pool].sort((a, b) => b.match_score - a.match_score)[0] ?? null
}

/**
 * The best match of EACH of the user's searches, in the searches' own order.
 *
 * `pickBestMatch` takes the single highest across everything, which is the right
 * answer for the 83% of users with one search and the wrong one for anybody with
 * two: a second search whose best job scores below the first search's worst
 * would never surface, and the entry to the tailor loop — the whole reason to
 * open a second search — would only ever point back at the first.
 *
 * Cross-search ranking is not a question anyone asked. A consulting job and a
 * marketing job are not competing for one slot, so each search answers for
 * itself and `pickBestMatch`'s rule (strong first, else closest) runs inside it.
 *
 * One search in, one match out — byte-identical to `pickBestMatch`.
 */
export function pickBestPerTrack(
  jobs: JobMatch[],
  tracks: readonly { id: number | null }[],
): JobMatch[] {
  if (tracks.length < 2) {
    const one = pickBestMatch(jobs)
    return one ? [one] : []
  }
  return tracks.flatMap((track) => {
    // `undefined` and `null` are the same search — the profile. A row stamped
    // before tracks existed carries no `track_id` at all.
    const mine = jobs.filter((j) => (j.track_id ?? null) === track.id)
    const best = pickBestMatch(mine)
    return best ? [best] : []
  })
}
