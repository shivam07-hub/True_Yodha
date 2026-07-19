"use client"

import { Info } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

interface Factor { kind: "gap" | "strength"; label: string; detail: string }

export function ScoreExplanation({ factors }: { factors: Factor[] }) {
  return (
    <section aria-labelledby="score-reasons-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="score-reasons-title" className="text-base font-semibold text-[var(--tm-text)]">Why this score</h2>
        <Dialog>
          <DialogTrigger className="tm-control-focus rounded p-2 text-[var(--tm-text-muted)]" aria-label="How the Myro Score works"><Info className="size-4" /></DialogTrigger>
          <DialogContent className="max-w-lg bg-[var(--tm-surface)] text-[var(--tm-text)]">
            <DialogHeader><DialogTitle>How the score works</DialogTitle><DialogDescription>Your starting point from skill evidence in your CV.</DialogDescription></DialogHeader>
            <p className="leading-6 text-[var(--tm-text-muted)]">Myro scores the skill domains your CV proves and calibrates proficiency to your experience level. Job Readiness is separate and role-specific. Neither is an ATS guarantee or a prediction of a hiring decision.</p>
          </DialogContent>
        </Dialog>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {factors.map((factor) => <div key={`${factor.kind}-${factor.label}`} className="rounded-md border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] p-3"><p className="text-sm font-semibold text-[var(--tm-text)]">{factor.label}</p><p className="mt-1 text-xs leading-5 text-[var(--tm-text-muted)]">{factor.detail}</p></div>)}
      </div>
    </section>
  )
}
