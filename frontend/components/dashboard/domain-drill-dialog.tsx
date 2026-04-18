"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { useAuth } from "@/lib/hooks/use-auth"
import { diary } from "@/lib/api"
import type { UserSkillItem } from "@/lib/api"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { CheckIcon, BookOpenIcon } from "lucide-react"

const LEVEL_COLORS: Record<number, string> = {
  0: "bg-muted text-muted-foreground",
  1: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  2: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  3: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  4: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  5: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
}

interface Props {
  domain: string
  score: number
  skills: UserSkillItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

function SkillRow({ skill }: { skill: UserSkillItem }) {
  const { token } = useAuth()
  const [logged, setLogged] = useState(false)

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      diary.createEntry(
        token!,
        `Skill Focus — ${skill.display_name} (${skill.proficiency_title}, Level ${skill.level})\n\nI want to build further on ${skill.display_name} this week. Currently at ${skill.proficiency_title} (L${skill.level}). Goal: push to Level ${Math.min(skill.level + 1, 5)} through deliberate practice and real application.`,
      ),
    onSuccess: () => setLogged(true),
  })

  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium truncate">{skill.display_name}</span>
        <span
          className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${LEVEL_COLORS[skill.level] ?? LEVEL_COLORS[0]}`}
        >
          L{skill.level} · {skill.proficiency_title}
        </span>
      </div>
      <button
        onClick={() => !logged && mutate()}
        disabled={isPending || logged}
        className={`shrink-0 flex items-center gap-1 text-xs rounded-md px-2 py-1 transition-colors ${
          logged
            ? "text-green-600 dark:text-green-400 cursor-default"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        }`}
      >
        {logged ? (
          <>
            <CheckIcon className="w-3 h-3" />
            Logged
          </>
        ) : (
          <>
            <BookOpenIcon className="w-3 h-3" />
            {isPending ? "…" : "Log"}
          </>
        )}
      </button>
    </div>
  )
}

export function DomainDrillDialog({ domain, score, skills, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{domain}</DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Domain score: <span className="font-semibold text-foreground">{Math.round(score)}</span>
            /100 · {skills.length} skill{skills.length !== 1 ? "s" : ""} detected
          </p>
        </DialogHeader>

        {skills.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No skills detected in this domain yet.
          </p>
        ) : (
          <div className="overflow-y-auto flex-1 -mx-4 px-4">
            <p className="text-xs text-muted-foreground mb-2">
              Tap <BookOpenIcon className="inline w-3 h-3" /> to log a skill focus to your diary.
            </p>
            {skills.map((skill) => (
              <SkillRow key={skill.key} skill={skill} />
            ))}
          </div>
        )}

        <DialogFooter showCloseButton className="mt-2" />
      </DialogContent>
    </Dialog>
  )
}
