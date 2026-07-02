"use client"

import type { UserSkillsByDomain } from "@/lib/api"
import { extractedSkillsForCvPoint } from "@/lib/skill-intelligence"

interface CVPointSkillChipsProps {
  text: string
  skills?: UserSkillsByDomain | null
  maxVisible?: number
}

export function CVPointSkillChips({ text, skills, maxVisible = 4 }: CVPointSkillChipsProps) {
  const extracted = extractedSkillsForCvPoint(text, skills)
  if (extracted.length === 0) return null

  const visible = extracted.slice(0, maxVisible)
  const hiddenCount = Math.max(0, extracted.length - visible.length)
  const label = `ATS extracted skills: ${extracted.map((skill) => skill.displayName).join(", ")}`

  return (
    <div className="cvb-pgc-ats-skills" aria-label={label}>
      <span className="cvb-pgc-ats-label">ATS</span>
      {visible.map((skill) => (
        <span
          key={skill.key}
          className="cvb-pgc-ats-chip"
          title={`${skill.displayName} · L${skill.level}`}
        >
          {skill.displayName}
        </span>
      ))}
      {hiddenCount > 0 && <span className="cvb-pgc-ats-more">+{hiddenCount}</span>}
    </div>
  )
}
