import type { CVStructured, UserSkillItem } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"

export interface MentorRewriteTarget {
  iid: string
  keywords: string[]
}

const norm = (value: string): string => value.trim().toLowerCase()

/** Locate the real CV bullet behind a practiced skill's stored evidence. */
export function mentorRewriteTarget(
  cv: CVStructured,
  skills: UserSkillItem[],
  requestedSkill: string,
): MentorRewriteTarget | null {
  const requested = norm(requestedSkill)
  if (!requested) return null
  const skill = skills.find(item => (
    norm(item.key) === requested || norm(item.display_name) === requested
  ))
  const evidence = skill?.evidence_text?.trim()
  if (!skill || !evidence) return null

  const candidates: Array<{ iid: string; text: string }> = []
  cv.experience.forEach((experience, experienceIndex) => {
    experience.bullets.forEach((text, bulletIndex) => {
      candidates.push({
        iid: itemId("exp_bullet", experienceIndex * 100 + bulletIndex, text),
        text,
      })
    })
  })
  cv.projects.forEach((project, projectIndex) => {
    project.bullets.forEach((text, bulletIndex) => {
      candidates.push({
        iid: itemId("proj_bullet", projectIndex * 100 + bulletIndex, text),
        text,
      })
    })
  })

  const exact = candidates.find(candidate => candidate.text.trim() === evidence)
  const excerpt = exact ?? candidates.find(candidate => norm(candidate.text).includes(norm(evidence)))
  return excerpt ? { iid: excerpt.iid, keywords: [skill.display_name] } : null
}
