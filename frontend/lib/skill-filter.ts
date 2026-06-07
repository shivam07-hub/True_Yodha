/**
 * Unified skill-filter model for the Skill Intelligence (Intel) surface.
 *
 * Replaces the old two-bar split (header stat tiles that didn't filter +
 * PracticeSkillList's own All/On-CV/Gaps tabs). One state object now drives the
 * whole list: a status axis (the tappable stat tiles), a domain axis (the
 * "which domain" ask), and a sort axis (demand-first vs default).
 *
 * Pure functions only — no React, fully unit-testable.
 */

import { skillTier } from "@/lib/skill-tier"
import type { OwnedPracticeSkill, PracticeSkills } from "@/lib/practice-skills"

/** Status axis — maps 1:1 to the header stat tiles + the old filter row. */
export type SkillStatus = "all" | "on-cv" | "gaps" | "need-proof" | "below-40"

/** Sort axis — list-level concern. */
export type SkillSort = "default" | "demand"

export interface SkillFilterState {
  status: SkillStatus
  /** null = all domains. Only owned skills carry a domain, so this hides gaps. */
  domain: string | null
  sort: SkillSort
}

export const DEFAULT_SKILL_FILTER: SkillFilterState = {
  status: "all",
  domain: null,
  sort: "default",
}

/** A skill "needs proof" when it has no CV evidence. Gaps never have evidence. */
function ownedNeedsProof(s: OwnedPracticeSkill): boolean {
  return !s.item.evidence_text
}

/** "Below 40%" = weak skills = tier "gap" (level < 2). Aligns filter with list. */
function ownedIsWeak(s: OwnedPracticeSkill): boolean {
  return skillTier(s.item.level) === "gap"
}

/**
 * Apply the filter to the practice skills. Returns the owned + gap subsets the
 * list should render, already sorted. Section grouping stays the list's job.
 */
export function applySkillFilter(
  skills: PracticeSkills,
  filter: SkillFilterState,
): PracticeSkills {
  const { status, domain, sort } = filter

  let owned = skills.owned
  // Gaps are not domain-tagged, so a domain selection hides them.
  let gaps = domain ? [] : skills.gaps

  if (domain) owned = owned.filter((s) => s.domain === domain)

  switch (status) {
    case "on-cv":
      gaps = []
      break
    case "gaps":
      owned = []
      break
    case "need-proof":
      owned = owned.filter(ownedNeedsProof)
      // every gap lacks evidence by definition → all qualify
      break
    case "below-40":
      owned = owned.filter(ownedIsWeak)
      // gaps are level 0 → weak by definition → all qualify
      break
    case "all":
    default:
      break
  }

  if (sort === "demand") {
    owned = [...owned].sort((a, b) => b.demand - a.demand || b.jobCount - a.jobCount)
    gaps = [...gaps].sort((a, b) => b.demand - a.demand || b.jobCount - a.jobCount)
  }

  return { owned, gaps }
}
