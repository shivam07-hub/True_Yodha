/**
 * match-score — THE one number for "how close is the present CV to this JD".
 *
 * Semantic-first, keyword-assist (Shivam lock, 2026-07-16): the Lane C
 * requirement coverage (real JD requirements classified against the user's
 * career stories — covered / partial / missing) carries 70% of the score;
 * verbatim keyword landing on the visible CV carries 30%; recruiter-check
 * content-quality findings subtract as before. Exact-syntax skill matching
 * assists the score but never controls it — which is why a job the match
 * brain calls "Worth it" can no longer render a 0/100 CV score.
 *
 * Every point stays explainable: the Job-fit rail explains the semantic 70
 * (one row per requirement), the Fixes rail explains the keyword 30 and the
 * penalty. No opaque blend.
 *
 * Honest fallback: when the coverage parse hasn't landed (or found nothing),
 * the score is keyword-only — the pre-existing Ready math — never a fake 0.
 */

export const SEMANTIC_WEIGHT = 0.7
export const KEYWORD_WEIGHT = 0.3

export interface CoverageCounts {
  covered: number
  weak: number
  gap: number
}

/** Semantic closeness 0–100 from requirement coverage: covered = full credit,
 *  partial (weak) = half, missing = none. Null when there are no requirements
 *  to score against (parse pending / empty) — the caller falls back honestly. */
export function coveragePct(counts: CoverageCounts | null | undefined): number | null {
  if (!counts) return null
  const total = counts.covered + counts.weak + counts.gap
  if (total <= 0) return null
  return ((counts.covered + 0.5 * counts.weak) / total) * 100
}

/** The ONE header number. `keywordPct` is the weighted keyword-landing percent
 *  (server skill credit + live text hits — the old Ready base). */
export function matchScore(
  counts: CoverageCounts | null | undefined,
  keywordPct: number,
  contentPenaltyPts: number,
): number {
  const semantic = coveragePct(counts)
  const blended = semantic == null
    ? keywordPct
    : SEMANTIC_WEIGHT * semantic + KEYWORD_WEIGHT * keywordPct
  return Math.max(0, Math.min(100, Math.round(blended - contentPenaltyPts)))
}

/** The span (in score points) the keyword layer owns — fix cards' "+N" must
 *  promise exactly what applying the fix delivers, so a keyword's share of the
 *  layer scales by whether the semantic layer is present. */
export function keywordLayerSpan(hasSemantic: boolean): number {
  return hasSemantic ? KEYWORD_WEIGHT * 100 : 100
}
