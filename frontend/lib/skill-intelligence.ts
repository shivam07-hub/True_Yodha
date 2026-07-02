import type { UserSkillsByDomain, UserSkillItem } from "./api"

export type SkillReadiness = "Gap" | "Building" | "Strong"
export interface CvPointExtractedSkill {
  key: string
  displayName: string
  level: number
  evidenceText: string
}

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

function normalizeEvidenceText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase()
}

export function extractedSkillsForCvPoint(
  pointText: string,
  skills?: UserSkillsByDomain | null,
): CvPointExtractedSkill[] {
  const point = normalizeEvidenceText(pointText)
  if (!point) return []

  const seen = new Set<string>()
  const matches: CvPointExtractedSkill[] = []
  for (const skill of Object.values(skills?.by_domain ?? {}).flat()) {
    const evidenceText = skill.evidence_text?.trim()
    if (!evidenceText || seen.has(skill.key)) continue
    const evidence = normalizeEvidenceText(evidenceText)
    if (point === evidence || point.includes(evidence)) {
      seen.add(skill.key)
      matches.push({
        key: skill.key,
        displayName: skill.display_name,
        level: skill.level,
        evidenceText,
      })
    }
  }
  return matches
}

export function skillDemandTotal(
  rowDataMap: Record<string, Record<string, number> | null>,
  skillName: string,
): number {
  return Object.values(rowDataMap).reduce((sum, row) => sum + (row?.[skillName] ?? 0), 0)
}
