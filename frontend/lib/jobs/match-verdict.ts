import type { JobMatch } from "@/lib/api"

type Verdict = JobMatch["verdict"]

/**
 * The verdict WORD shown beside the Match number — the single source for the
 * words. Its tone (colour) is the CSS split-partner: `.fc-verdict-{verdict}` in
 * feed-card.css owns the colour, so verdict→tone lives in exactly one place.
 */
export function verdictLabel(v: Verdict): string {
  switch (v) {
    case "strong":
      return "Strong"
    case "worth_it":
      return "Worth it"
    case "stretch":
      return "Stretch"
    case "checking":
      return "Checking fit…"
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
 * do" (not "how good"). Read by both the market card (`card-view.marketMove`)
 * and the mobile row (`job-model`), so the directive is decided once. `null`
 * when the brain hasn't ranked the card (checking / un-warmed) — a browse row
 * has no move. Gap count is caller-supplied so this stays a pure verdict→intent
 * map.
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
