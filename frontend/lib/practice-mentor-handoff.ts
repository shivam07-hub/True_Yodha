/**
 * A passing assessment can update the Main CV only after the user asks.
 * Existing CV evidence goes through Mentor's evidence-backed rewrite; without
 * a bullet pointer, the existing Skills Refresh path adds only the proven skill
 * to the skills section and never invents an achievement claim.
 */
export function cvUpgradeHref({
  skill,
  hasCvEvidence,
}: {
  skill: string
  hasCvEvidence: boolean
}): string | null {
  const cleanSkill = skill.trim()
  if (!cleanSkill) return null

  const params = new URLSearchParams()
  params.set("edit", "1")
  params.set("skill", cleanSkill)
  if (hasCvEvidence) {
    params.set("mentor", "1")
  } else {
    params.set("tab", "skills")
    params.set("addProven", "1")
  }
  return `/cv?${params.toString()}`
}

export function practiceHref(skill: string, jobId?: string | null): string {
  const params = new URLSearchParams({ skill: skill.trim() })
  if (jobId?.trim()) params.set("jobId", jobId.trim())
  return `/practice?${params.toString()}`
}
