"use client"

import { Grid3X3 } from "lucide-react"
import type { UserSkillDemandItem } from "@/lib/api"

interface SkillColumnPickerProps {
  skills: string[]
  allSkills: UserSkillDemandItem[]
  selectedSkillNames: Set<string>
  selectedCount: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onToggleSkill: (name: string) => void
}

export function SkillColumnPicker({
  skills,
  allSkills,
  selectedSkillNames,
  selectedCount,
  open,
  onOpenChange,
  onToggleSkill,
}: SkillColumnPickerProps) {
  return (
    <div className="si-picker-wrap">
      <button type="button" className="si-columns-btn" onClick={() => onOpenChange(!open)}>
        <Grid3X3 size={14} />
        Columns / {skills.length}
      </button>
      {open ? (
        <>
          <button type="button" className="si-picker-scrim" aria-label="Close skill picker" onClick={() => onOpenChange(false)} />
          <div className="si-picker">
            {allSkills.map((skill) => {
              const active = selectedSkillNames.has(skill.display_name)
              const canToggle = !active || selectedCount > 1
              return (
                <button
                  key={skill.display_name}
                  type="button"
                  disabled={!canToggle}
                  onClick={() => canToggle && onToggleSkill(skill.display_name)}
                >
                  <span className={active ? "is-on" : ""}>{active ? "on" : ""}</span>
                  {skill.display_name}
                  <b>L{skill.current_level}</b>
                </button>
              )
            })}
          </div>
        </>
      ) : null}
    </div>
  )
}
