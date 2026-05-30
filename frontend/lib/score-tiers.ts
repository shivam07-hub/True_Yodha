/**
 * Myro Score tiers — single source of truth (#6 lock Q5).
 * Consumed by ScoreRing (/skills hero) and CvScoreProgress (upload done-morph)
 * so the tier vocabulary never drifts between surfaces. Non-punitive
 * "Next milestone" framing.
 */
export interface ScoreTier {
  min: number
  label: string
  next: number | null
  nextLabel: string | null
}

export const SCORE_TIERS: ReadonlyArray<ScoreTier> = [
  { min: 80, label: "Advanced", next: null, nextLabel: null },
  { min: 60, label: "Competent", next: 80, nextLabel: "Advanced" },
  { min: 40, label: "Developing", next: 60, nextLabel: "Competent" },
  { min: 20, label: "Emerging", next: 40, nextLabel: "Developing" },
  { min: 0, label: "Building foundation", next: 20, nextLabel: "Emerging" },
]

export function tierForScore(score: number): ScoreTier {
  return SCORE_TIERS.find((t) => score >= t.min) ?? SCORE_TIERS[SCORE_TIERS.length - 1]
}
