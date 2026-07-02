import type { UserSkillsByDomain, UserSkillItem } from "./api"

export type SkillReadiness = "Gap" | "Building" | "Strong"

export function skillReadiness(level: number): SkillReadiness {
  if (level >= 4) return "Strong"
  if (level >= 2) return "Building"
  return "Gap"
}

export function nextSkillLevel(level: number): number {
  return Math.min(5, Math.max(1, level + 1))
}

export function buildSkillEvidenceIndex(skills?: UserSkillsByDomain | null): Record<string, UserSkillItem> {
  const index: Record<string, UserSkillItem> = {}
  for (const skill of Object.values(skills?.by_domain ?? {}).flat()) {
    index[skill.display_name.toLowerCase()] = skill
  }
  return index
}

export function skillDemandTotal(
  rowDataMap: Record<string, Record<string, number> | null>,
  skillName: string,
): number {
  return Object.values(rowDataMap).reduce((sum, row) => sum + (row?.[skillName] ?? 0), 0)
}
