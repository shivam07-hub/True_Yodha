/* Upskilling shared constants + helpers (PRD §4).
   PROFICIENCY titles mirror the existing skill ladder (Scout→Legend); token
   tiers + pass bar are the source-of-truth on the FRONTEND for honest copy only
   — the server holds the real grading + award (xp_policy.UPSKILLING_*). */

import type { DemandBand } from "@/lib/api"

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

export type Tier = "gap" | "building" | "strong"

export function tierOf(level: number): Tier {
  if (level >= 4) return "strong"
  if (level >= 2) return "building"
  return "gap"
}

export function tierLabel(level: number): string {
  const t = tierOf(level)
  return t === "strong" ? "Strong" : t === "building" ? "Building" : "Gap"
}

export const DEMAND_RANK: Record<DemandBand, number> = {
  very_high: 4,
  high: 3,
  moderate: 2,
  low: 1,
  none: 0,
}

export const DEMAND_LABEL: Record<DemandBand, string> = {
  very_high: "Very hot",
  high: "Hot",
  moderate: "Warm",
  low: "Cool",
  none: "",
}
