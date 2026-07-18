"use client"

import { ArrowRight, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScoreExplanation } from "@/components/onboarding/score-explanation"
import { SkillCorrectionSheet } from "@/components/onboarding/skill-correction-sheet"
import { BandPercentileLine } from "@/components/skills/band-percentile-line"
import type { OnboardingResult } from "@/lib/api"

type FullResultData = Extract<OnboardingResult, { kind: "full_result_ready" }>

interface Props { token: string; result: FullResultData; onAction: (kind: string, href: string) => void; onCorrected: () => void }

export function FullResult({ token, result, onAction, onCorrected }: Props) {
  return (
    <section className="w-full max-w-4xl pb-8" aria-labelledby="result-title">
      <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
        <div>
          <p className="text-sm font-semibold text-[var(--tm-interactive)]">What Myro understood</p>
          <h1 id="result-title" className="mt-2 text-balance text-3xl font-semibold tracking-normal text-[var(--tm-text)]">Your starting point for {result.target.role_title}</h1>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">{[result.target.seniority, result.target.location].filter(Boolean).map((item) => <span key={item} className="rounded border border-[var(--tm-border)] bg-[var(--tm-surface)] px-3 py-1.5 capitalize text-[var(--tm-text-muted)]">{item}</span>)}</div>
          <div className="mt-5 divide-y divide-[var(--tm-border-soft)] rounded-md border border-[var(--tm-border-soft)] bg-[var(--tm-surface)]">{result.skills.map((skill) => <details key={skill.taxonomy_key} className="group px-4 py-3"><summary className="tm-control-focus flex cursor-pointer list-none items-center justify-between rounded text-sm font-medium"><span>{skill.name}{typeof skill.level === "number" && <span className="ml-2 text-xs font-normal text-[var(--tm-text-faint)]">L{skill.level}</span>}</span><ChevronDown className="size-4 group-open:rotate-180" /></summary><p className="mt-2 text-sm leading-6 text-[var(--tm-text-muted)]">{skill.evidence || "Detected in your current CV."}</p></details>)}</div>
          <div className="mt-2"><SkillCorrectionSheet token={token} baselineId={result.baseline_version_id} proof={result.skills} onSaved={onCorrected} /></div>
        </div>
        <aside className="flex min-h-44 flex-col justify-center rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)] p-5 text-center">
          <p className="text-sm font-medium text-[var(--tm-text-muted)]">Your Myro Score</p>
          <p className="mt-2 text-5xl font-semibold tabular-nums text-[var(--tm-text)]">{Math.round(result.score.total_score)}</p>
          {result.score.top_percent != null ? (
            <div className="mt-2 flex justify-center">
              <BandPercentileLine band={result.score.band} topPercent={result.score.top_percent} />
            </div>
          ) : (
            <p className="mt-2 text-xs leading-5 text-[var(--tm-text-muted)]">Starting point for your target role</p>
          )}
        </aside>
      </div>
      <div className="mt-6"><ScoreExplanation factors={result.score_factors} /></div>
      <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Button size="lg" onClick={() => onAction(result.primary_action.kind, result.primary_action.href)}>{result.primary_action.label}<ArrowRight className="size-5" /></Button>
        <Button size="lg" variant="outline" onClick={() => onAction(result.secondary_action.kind, result.secondary_action.href)}>{result.secondary_action.label}</Button>
      </div>
    </section>
  )
}
