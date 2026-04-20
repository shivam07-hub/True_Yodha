"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { BookOpen, CheckCircle2, Circle, PenLine, Trash2 } from "lucide-react"

const ACTION_TEMPLATES: Array<(skill: string) => string> = [
  (s) => `Find a "${s}" course or tutorial (YouTube, Coursera, fast.ai)`,
  (s) => `Practice "${s}" for 30 min today and log it in your diary`,
  (s) => `Study 3 job postings that list "${s}" as a requirement`,
  (s) => `Add "${s}" to your CV if you have any hands-on experience`,
]

interface ActionPlanPanelProps {
  taggedSkills: Set<string>
  onRemoveSkill: (skill: string) => void
  onClearAll: () => void
}

export function ActionPlanPanel({ taggedSkills, onRemoveSkill, onClearAll }: ActionPlanPanelProps) {
  const router = useRouter()
  const skills = Array.from(taggedSkills)

  // checked state: "Python::0", "Python::1", etc.
  const [checked, setChecked] = useState<Set<string>>(new Set())

  const totalItems = skills.length * ACTION_TEMPLATES.length
  const completedItems = checked.size
  const progressPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0

  function toggleItem(key: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key) } else { next.add(key) }
      return next
    })
  }

  function draftDiaryEntry() {
    const params = new URLSearchParams({ skills: skills.join(",") })
    router.push(`/diary?${params.toString()}`)
  }

  if (skills.length === 0) return null

  return (
    <section className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-primary/10 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <BookOpen className="h-3.5 w-3.5 text-primary" />
            Your Action Plan
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {completedItems}/{totalItems} actions · {progressPct}% complete
          </p>
        </div>
        <button
          onClick={onClearAll}
          className="mt-0.5 text-[11px] text-muted-foreground hover:text-destructive"
          title="Clear plan"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full bg-primary/10">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Skill sections */}
      <div className="divide-y divide-border/50 px-4">
        {skills.map((skill) => (
          <div key={skill} className="py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {skill}
              </span>
              <button
                onClick={() => onRemoveSkill(skill)}
                className="text-[10px] text-muted-foreground hover:text-destructive"
              >
                remove
              </button>
            </div>
            <ul className="space-y-1.5">
              {ACTION_TEMPLATES.map((tpl, i) => {
                const key = `${skill}::${i}`
                const done = checked.has(key)
                return (
                  <li key={key}>
                    <button
                      onClick={() => toggleItem(key)}
                      className="group flex w-full items-start gap-2 text-left"
                    >
                      {done ? (
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      ) : (
                        <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40 group-hover:text-primary/60" />
                      )}
                      <span className={`text-xs leading-relaxed ${done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                        {tpl(skill)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* Footer CTA */}
      <div className="flex items-center justify-between border-t border-primary/10 px-4 py-3">
        <p className="text-[11px] text-muted-foreground">
          Log your progress in today&apos;s diary
        </p>
        <button
          onClick={draftDiaryEntry}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
        >
          <PenLine className="h-3 w-3" />
          Draft diary entry
        </button>
      </div>
    </section>
  )
}
