"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { trackEvent } from "@/lib/analytics"
import { proofTier, PROOF_TIER_COPY, type ProofTier } from "@/lib/cv/skill-proof"
import { onboarding, type OnboardingResult } from "@/lib/api"
import { cn } from "@/lib/utils"

type SkillResult = Extract<OnboardingResult, { kind: "awaiting_skill_confirmation" }>
type Props = {
  token: string
  result: SkillResult
  onConfirmed: () => void
  /** Return to where the user actually is. Only present when they came back
   *  here to review — a first-time visitor has nothing ahead of them. */
  onForward?: () => void
}

const ORDER: ProofTier[] = ["proven", "listed", "none"]

type Skill = SkillResult["skills"][number]

/**
 * Skills that came out of the SAME line of the CV, grouped under that line.
 *
 * The pointer is the point. A first-run user is being asked to rule on a list of
 * skills they never wrote down, and the only thing that makes that answerable is
 * seeing the sentence Myro read them out of. This surface used to print the
 * evidence as a truncated fragment beside each name, which at 375px clipped to a
 * few words and repeated the same line once per skill it produced.
 *
 * Same shape as the CV playground's Skills rail (`SkillProvenance`), on purpose:
 * the thing learned here on day one is the thing that keeps working on day one
 * hundred. Both read tiers from the one `skill-proof` rule, so they cannot
 * disagree about what a skill is worth.
 *
 * The `none` tier has nothing to point at — its evidence is the skill's own name
 * echoed back — so those stay a flat list rather than being given a quote card
 * that would imply proof we do not hold.
 */
function groupByCVLine(skills: Skill[], keepEvidence: boolean): { line: string; skills: Skill[] }[] {
  if (!keepEvidence) return skills.length ? [{ line: "", skills }] : []
  const byLine = new Map<string, Skill[]>()
  for (const skill of skills) {
    const line = (skill.evidence ?? "").trim()
    const bucket = byLine.get(line)
    if (bucket) bucket.push(skill)
    else byLine.set(line, [skill])
  }
  return Array.from(byLine.entries())
    .map(([line, group]) => ({ line, skills: group }))
    .sort((a, b) => b.skills.length - a.skills.length)
}

export function FirstRunSkillReview({ token, result, onConfirmed, onForward }: Props) {
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const keptCount = result.skills.length - removed.size
  const groups = useMemo(() => ORDER.map((tier) => {
    const skills = result.skills.filter((skill) => proofTier(skill.evidence, skill.name) === tier)
    return { tier, skills, points: groupByCVLine(skills, tier !== "none") }
  }).filter((group) => group.skills.length > 0), [result.skills])

  function mutate(fn: (next: Set<string>) => void) {
    setError(null)
    setRemoved((current) => {
      const next = new Set(current)
      fn(next)
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
    <section className="w-full max-w-2xl pb-28" aria-labelledby="skill-review-title">
      <p className="text-sm font-semibold text-[var(--tm-interactive)]">Step 1 of 3</p>
      <h1 id="skill-review-title" className="mt-2 text-balance text-3xl font-semibold text-[var(--tm-text)]">
        Check what Myro found
      </h1>
      {/* One line at body size. The old two-clause subtitle at sm:text-base
          competed with the h1 and restated what the checkboxes already show. */}
      <p className="mt-2 text-sm leading-6 text-[var(--tm-text-muted)]">
        Untick anything that isn&apos;t yours.
      </p>

      <div className="mt-7 space-y-8">
        {groups.map(({ tier, skills, points }) => {
          const keys = skills.map((skill) => skill.taxonomy_key)
          const allRemoved = keys.every((key) => removed.has(key))
          return (
            <fieldset key={tier}>
              <div className="flex items-baseline justify-between gap-4 border-b border-[var(--tm-border-soft)] pb-2">
                <legend className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-[var(--tm-text)]">{PROOF_TIER_COPY[tier].label}</span>
                  <span className="font-mono text-xs tabular-nums text-[var(--tm-text-faint)]">{skills.length}</span>
                </legend>
                {/* 14 keyword-inferred skills is a bulk decision, not 14 decisions. */}
                <button
                  type="button"
                  onClick={() => mutate((next) => keys.forEach((key) => (allRemoved ? next.delete(key) : next.add(key))))}
                  className="tm-control-focus shrink-0 rounded text-xs text-[var(--tm-text-muted)] underline underline-offset-4"
                >
                  {allRemoved ? "Keep all" : "Remove all"}
                </button>
              </div>

              {/* Only the tiers with a real receipt get one. `none` says so instead. */}
              {tier === "none" && (
                <p className="mt-2 text-sm leading-6 text-[var(--tm-text-muted)]">{PROOF_TIER_COPY.none.note}</p>
              )}

              <div className="mt-3 space-y-5">
                {points.map(({ line, skills: lineSkills }) => (
                  <div key={line || tier}>
                    {line && (
                      // The CV's own words, quoted whole and never truncated —
                      // this line IS the answer to "why does Myro think I have
                      // this?", and a clipped one answers nothing.
                      <p className="border-l-2 border-[var(--tm-border)] pl-3 text-sm leading-6 text-[var(--tm-text-muted)]">
                        {line}
                      </p>
                    )}
                    <div className={cn("divide-y divide-[var(--tm-border-soft)]", line && "mt-1")}>
                      {lineSkills.map((skill) => {
                        const excluded = removed.has(skill.taxonomy_key)
                        return (
                          <label
                            key={skill.taxonomy_key}
                            className={cn(
                              "flex min-h-11 cursor-pointer items-center gap-3 py-2.5",
                              excluded && "opacity-45",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={!excluded}
                              onChange={() => mutate((next) => (excluded ? next.delete(skill.taxonomy_key) : next.add(skill.taxonomy_key)))}
                              className="tm-control-focus size-4 shrink-0 accent-[var(--tm-interactive)]"
                            />
                            <span className={cn("min-w-0 text-sm font-medium text-[var(--tm-text)]", excluded && "line-through")}>
                              {skill.name}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
          )
        })}
      </div>

      {/* The count and the action belong together: the number IS the thing being
          confirmed, so it stopped being a separate card in the margin. */}
      {/* Opaque, deliberately. This was `bg-[var(--tm-bg)]/95 backdrop-blur`, which
          computed to `rgba(0,0,0,0)` — Tailwind cannot apply an alpha modifier to
          an arbitrary CSS variable, so it dropped the background entirely and the
          skill rows scrolled visibly through the bar behind "N kept". A count that
          is the thing being confirmed cannot be rendered over moving text. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[var(--tm-border-soft)] bg-[var(--tm-bg)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <p className="text-sm text-[var(--tm-text-muted)]">
            <span className="font-semibold tabular-nums text-[var(--tm-text)]">{keptCount}</span> kept
            {removed.size > 0 && <span className="tabular-nums"> · {removed.size} removed</span>}
          </p>
          <div className="flex flex-1 items-center gap-2 sm:flex-none">
            {onForward && <Button variant="ghost" size="lg" className="min-h-12" onClick={onForward}>Back to my shortlist</Button>}
            <Button size="lg" className="min-h-12 flex-1 sm:flex-none" disabled={busy || keptCount < 1} onClick={() => void confirm()}>
              {busy ? "Saving…" : keptCount < 1 ? "Keep at least one" : "Looks right →"}
            </Button>
          </div>
        </div>
        {error && <p role="alert" className="mx-auto max-w-5xl px-5 pb-3 text-sm text-[var(--tm-danger)] sm:px-8">{error}</p>}
      </div>
    </section>
  )
}
