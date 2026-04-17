"use client"

import type { LucideIcon } from "lucide-react"
import { X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface DrillDownDialogProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle: string
  skills: string[]
  icon: LucideIcon
  taggedSkills: Set<string>
  onTagSkill: (skill: string) => void
}

export function DrillDownDialog({
  open,
  onClose,
  title,
  subtitle,
  skills,
  icon: Icon,
  taggedSkills,
  onTagSkill,
}: DrillDownDialogProps) {
  const taggedCount = skills.filter((s) => taggedSkills.has(s)).length

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <Icon className="h-4 w-4 text-primary" />
            </span>
            {title}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </DialogHeader>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Skills in demand
            </p>
            {taggedCount > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {taggedCount} tagged
              </span>
            )}
          </div>
          {skills.length === 0 ? (
            <p className="text-xs text-muted-foreground">No skill data available.</p>
          ) : (
            <>
              <p className="mb-2 text-[11px] text-muted-foreground">Tap a skill to tag it for your diary</p>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((skill, i) => {
                  const tagged = taggedSkills.has(skill)
                  return (
                    <button
                      key={skill}
                      onClick={() => onTagSkill(skill)}
                      title={tagged ? `Remove "${skill}"` : `Tag "${skill}" for diary`}
                      className={[
                        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all",
                        tagged
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : i < 3
                          ? "border-transparent bg-primary/10 text-primary hover:bg-primary/20"
                          : "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
                      ].join(" ")}
                    >
                      {skill}
                      {tagged && <X className="h-3 w-3 opacity-70" />}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
