/**
 * match-score — THE one number for "how close is the present CV to this JD".
 *
 * Coverage-only (2026-07-18): the Lane C requirement coverage — the JD's REAL
 * requirements (parsed by a judgment-lane model, never job_skills) classified
 * against the user's career stories AND their on-CV lines (covered / partial /
 * missing) — IS the Match score; recruiter-check content findings subtract.
 *
 * The old taxonomy keyword-landing layer (verbatim job_skills terms, weighted
 * 30%) is gone: on a non-tech JD it scored garbage targets ("Go (Programming
 * Language)" on a sales role) → the 0/100-beside-"Worth it" header bug. Coverage
 * already counts stories AND on-CV lines, so a CV whose experience genuinely
 * covers the JD scores high and one that doesn't scores low — honestly, never a
 * fake 0 from a keyword that never appears verbatim.
 *
 * Every point stays explainable: the Job-fit rail explains the coverage (one row
 * per requirement); the Fixes rail explains the content penalty. No opaque blend.
 *
 * Honest fallback: before the coverage parse lands (or if it finds nothing), the
 * score falls back to the job's deterministic readiness — never a fabricated 0.
 */

export interface CoverageCounts {
  covered: number
  weak: number
  gap: number
}

/** Coverage closeness 0–100: covered = full credit, partial (weak) = half,
 *  missing = none. Null when there are no requirements to score against (parse
 *  pending / empty) — the caller falls back honestly. */
export function coveragePct(counts: CoverageCounts | null | undefined): number | null {
  if (!counts) return null
  const total = counts.covered + counts.weak + counts.gap
  if (total <= 0) return null
  return ((counts.covered + 0.5 * counts.weak) / total) * 100
}

/** The ONE header number. Coverage is the whole score when present; `fallbackPct`
 *  is the job's deterministic readiness, used only until coverage lands. */
export function matchScore(
  counts: CoverageCounts | null | undefined,
  fallbackPct: number,
  contentPenaltyPts: number,
): number {
  const coverage = coveragePct(counts)
  const base = coverage == null ? fallbackPct : coverage
  return Math.max(0, Math.min(100, Math.round(base - contentPenaltyPts)))
}
