import type { JobMatch } from "@/lib/api"

type Verdict = JobMatch["verdict"]

/** The verdict word shown beside the Match number. One source for every surface. */
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

/** Verdict → a `--tm-*` colour token, so the word's tone matches its meaning
 *  (strong=success, worth_it=accent, stretch=warning, checking=muted) — and a
 *  Stretch reads honestly even when its number isn't low. */
export function verdictColor(v: Verdict): string {
  switch (v) {
    case "strong":
      return "var(--tm-success)"
    case "worth_it":
      return "var(--tm-interactive)"
    case "stretch":
      return "var(--tm-warning)"
    case "checking":
      return "var(--tm-text-faint)"
  }
}

/** Whether to show the honest "you're early for this" Stretch framing. */
export function isStretch(v: Verdict): boolean {
  return v === "stretch"
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
