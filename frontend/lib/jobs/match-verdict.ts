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
