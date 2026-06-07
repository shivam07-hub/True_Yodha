export type SkillTier = "gap" | "building" | "strong"

export function skillTier(level: number): SkillTier {
  if (level >= 4) return "strong"
  if (level >= 2) return "building"
  return "gap"
}

export function skillTierLabel(level: number): string {
  const t = skillTier(level)
  return t === "strong" ? "Strong" : t === "building" ? "Building" : "Gap"
}

/** Plain-English explanation of a skill tier, for tooltips. Level bands match skillTier(). */
export function skillTierHint(level: number): string {
  const t = skillTier(level)
  if (t === "strong") return "Strong: L4–L5. Proven skill — keep your CV evidence fresh."
  if (t === "building") return "Building: L2–L3. Active practice moves it toward Strong."
  return "Gap: L0–L1. Needs focused practice to start leveling up."
}

export function domainTier(avg: number): SkillTier {
  if (avg >= 70) return "strong"
  if (avg >= 40) return "building"
  return "gap"
}

export function domainTierLabel(avg: number): string {
  const t = domainTier(avg)
  return t === "strong" ? "STRONG" : t === "building" ? "BUILDING" : "AT RISK"
}

export interface TierTokens {
  fg: string
  bg: string
  border: string
}

export const TIER_TOKENS: Record<SkillTier, TierTokens> = {
  gap:      { fg: "var(--tm-tier-gap-fg)",      bg: "var(--tm-tier-gap-bg)",      border: "var(--tm-tier-gap-border)" },
  building: { fg: "var(--tm-tier-building-fg)", bg: "var(--tm-tier-building-bg)", border: "var(--tm-tier-building-border)" },
  strong:   { fg: "var(--tm-tier-strong-fg)",   bg: "var(--tm-tier-strong-bg)",   border: "var(--tm-tier-strong-border)" },
}
