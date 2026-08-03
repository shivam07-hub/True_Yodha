"use client"

import { useMemo, useState } from "react"
import { Check, FileCheck2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { trackEvent } from "@/lib/analytics"
import { proofTier, PROOF_TIER_COPY, type ProofTier } from "@/lib/cv/skill-proof"
import { onboarding, type OnboardingResult } from "@/lib/api"
import { cn } from "@/lib/utils"

type SkillResult = Extract<OnboardingResult, { kind: "awaiting_skill_confirmation" }>
type Props = { token: string; result: SkillResult; onConfirmed: () => void }

const ORDER: ProofTier[] = ["proven", "listed", "none"]

export function FirstRunSkillReview({ token, result, onConfirmed }: Props) {
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const keptCount = result.skills.length - removed.size
  const groups = useMemo(() => ORDER.map((tier) => ({
    tier,
    skills: result.skills.filter((skill) => proofTier(skill.evidence, skill.name) === tier),
  })).filter((group) => group.skills.length > 0), [result.skills])

  function toggle(key: string) {
    setError(null)
    setRemoved((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function confirm() {
    if (busy || keptCount < 1) return
    setBusy(true)
    setError(null)
    try {
      await onboarding.confirmSkills(
        token,
        result.baseline_version_id,
        Array.from(removed).map((taxonomy_key) => ({ taxonomy_key, action: "exclude" as const })),
      )
      trackEvent("onboarding_skills_confirmed", { kept_count: keptCount })
      onConfirmed()
    } catch (reason) {
      setBusy(false)
      setError(reason instanceof Error ? reason.message : "Your review could not be saved.")
    }
  }

  return (
    <section className="w-full" aria-labelledby="skill-review-title">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold text-[var(--tm-interactive)]">Step 1 of 3</p>
        <h1 id="skill-review-title" className="mt-2 text-balance text-3xl font-semibold text-[var(--tm-text)] sm:text-4xl">
          Check what Myro found
        </h1>
        <p className="mt-3 max-w-xl text-pretty text-sm leading-6 text-[var(--tm-text-muted)] sm:text-base">
          Keep only skills that are truly yours. Each one stays connected to the CV evidence Myro read.
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-6">
          {groups.map(({ tier, skills }) => (
            <fieldset key={tier}>
              <legend className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-[var(--tm-text)]">
                {PROOF_TIER_COPY[tier].label}
                <span className="font-normal tabular-nums text-[var(--tm-text-faint)]">{skills.length}</span>
              </legend>
              <div className="space-y-2">
                {skills.map((skill) => {
                  const excluded = removed.has(skill.taxonomy_key)
                  return (
                    <label
                      key={skill.taxonomy_key}
                      className={cn(
                        "flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border bg-[var(--tm-surface)] p-4",
                        excluded ? "border-[var(--tm-border-soft)] opacity-60" : "border-[var(--tm-border)]",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={!excluded}
                        onChange={() => toggle(skill.taxonomy_key)}
                        className="tm-control-focus mt-0.5 size-5 shrink-0 accent-[var(--tm-interactive)]"
                      />
                      <span className="min-w-0">
                        <span className={cn("block font-medium text-[var(--tm-text)]", excluded && "line-through")}>{skill.name}</span>
                        {skill.evidence && <span className="mt-1 block text-pretty text-sm leading-5 text-[var(--tm-text-muted)]">“{skill.evidence}”</span>}
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          ))}
        </div>

        <aside className="h-fit rounded-lg border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] p-5 lg:sticky lg:top-8">
          <FileCheck2 className="size-5 text-[var(--tm-interactive)]" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-[var(--tm-text)]">Your evidence stays editable</p>
          <p className="mt-2 text-pretty text-sm leading-6 text-[var(--tm-text-muted)]">
            You can correct these skills later from your Main CV.
          </p>
          <p className="mt-4 flex items-center gap-2 text-sm font-medium text-[var(--tm-text)]">
            <Check className="size-4 text-[var(--tm-success)]" aria-hidden="true" />
            <span className="tabular-nums">{keptCount} kept</span>
          </p>
        </aside>
      </div>

      <div className="mt-8 border-t border-[var(--tm-border-soft)] pt-5">
        {error && <p role="alert" className="mb-3 text-sm text-[var(--tm-danger)]">{error}</p>}
        <Button size="lg" className="min-h-12 w-full sm:w-auto" disabled={busy || keptCount < 1} onClick={() => void confirm()}>
          {busy ? "Saving your skills…" : keptCount < 1 ? "Keep at least one skill" : `These ${keptCount} skills look right → Choose my direction`}
        </Button>
      </div>
    </section>
  )
}
