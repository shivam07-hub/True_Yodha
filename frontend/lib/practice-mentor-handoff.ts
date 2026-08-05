/**
 * Practice proves a level; it never proves a CV claim by itself. The Mentor
 * handoff is available only when Myro already has a CV evidence pointer.
 */
export function mentorRewriteHref({
  skill,
  jobId,
  hasCvEvidence,
}: {
  skill: string
  jobId?: string | null
  hasCvEvidence: boolean
}): string | null {
  const cleanSkill = skill.trim()
  if (!cleanSkill || !hasCvEvidence) return null

  const params = new URLSearchParams()
  if (jobId?.trim()) params.set("jobId", jobId.trim())
  else params.set("edit", "1")
  params.set("skill", cleanSkill)
  params.set("mentor", "1")
  return `/cv?${params.toString()}`
}

export function practiceHref(skill: string, jobId?: string | null): string {
  const params = new URLSearchParams({ skill: skill.trim() })
  if (jobId?.trim()) params.set("jobId", jobId.trim())
  return `/practice?${params.toString()}`
}
