/* Upskilling shared constants + helpers (PRD §4).
   PROFICIENCY titles mirror the existing skill ladder (Scout→Legend); token
   tiers + pass bar are the source-of-truth on the FRONTEND for honest copy only
   — the server holds the real grading + award (xp_policy.UPSKILLING_*). */

export const PROFICIENCY = [
  "None",
  "Scout",
  "Trailblazer",
  "Excavator",
  "Cartographer",
  "Legend",
] as const

export const PASS_BAR = 8
export const SET_SIZE = 10

/** Token tiers — surfaced honestly in UI, never the grading authority. PRD §4.3. */
export const COIN_TIERS = [
  { min: 10, tokens: 50 },
  { min: 9, tokens: 30 },
  { min: 8, tokens: 20 },
] as const

export function awardFor(score: number): number {
  for (const tier of COIN_TIERS) if (score >= tier.min) return tier.tokens
  return 0
}
