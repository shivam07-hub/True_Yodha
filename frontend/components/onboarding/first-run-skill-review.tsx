"use client"

import { useMemo, useState, type ReactNode } from "react"
import { trackEvent } from "@/lib/analytics"
import { proofTier, PROOF_TIER_COPY, type ProofTier } from "@/lib/cv/skill-proof"
import { onboarding, type OnboardingResult } from "@/lib/api"
import { cn } from "@/lib/utils"

type SkillResult = Extract<OnboardingResult, { kind: "awaiting_skill_confirmation" }>
export type FirstRunSkillReviewProps = {
  token: string
  result: SkillResult
  /** Carries the next step the server already assembled, so the page can move
   *  without asking for it a second time. */
  onConfirmed: (next: OnboardingResult) => void
  /** Return to where the user actually is. Only present when they came back
   *  here to review — a first-time visitor has nothing ahead of them. */
  onForward?: () => void
  children?: (chrome: SkillReviewChrome, list: ReactNode) => ReactNode
}

export type SkillReviewChrome = {
  keptCount: number
  removedCount: number
  busy: boolean
  error: string | null
  confirm: () => void
}

const ORDER: ProofTier[] = ["proven", "listed", "none"]

type Skill = SkillResult["skills"][number]

/**
 * Skills that came out of the SAME line of the CV, grouped under that line.
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

export function FirstRunSkillReview({ token, result, onConfirmed, children }: FirstRunSkillReviewProps) {
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
      const confirmed = await onboarding.confirmSkills(
        token,
        result.baseline_version_id,
        Array.from(removed).map((taxonomy_key) => ({ taxonomy_key, action: "exclude" as const })),
      )
      trackEvent("onboarding_skills_confirmed", { kept_count: keptCount })
      onConfirmed(confirmed.result)
    } catch (reason) {
      setBusy(false)
      setError(reason instanceof Error ? reason.message : "Your review could not be saved.")
    }
  }

  const list = (
    <aside className="cvb-v2-rail" aria-label="Skills Myro found">
      <div className="cvb-v2-railtabs">
        <span className="cvb-v2-tabbtn active">Skills</span>
      </div>
      <div className="cvb-v2-railbody">
        <div className="cvb-v2-railpane">
          <p className="cvb-v2-rail-lede">Untick anything that isn&apos;t yours.</p>
          <div className="space-y-8">
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
                    <button
                      type="button"
                      onClick={() => mutate((next) => keys.forEach((key) => (allRemoved ? next.delete(key) : next.add(key))))}
                      className="tm-control-focus inline-flex min-h-7 shrink-0 items-center rounded text-xs text-[var(--tm-text-muted)] underline underline-offset-4"
                    >
                      {allRemoved ? "Keep all" : "Remove all"}
                    </button>
                  </div>

                  {tier === "none" && (
                    <p className="mt-2 text-sm leading-6 text-[var(--tm-text-muted)]">{PROOF_TIER_COPY.none.note}</p>
                  )}

                  <div className="mt-3 space-y-5">
                    {points.map(({ line, skills: lineSkills }) => (
                      <div key={line || tier}>
                        {line && (
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
        </div>
      </div>
    </aside>
  )

  const chrome: SkillReviewChrome = {
    keptCount,
    removedCount: removed.size,
    busy,
    error,
    confirm: () => { void confirm() },
  }

  return children ? children(chrome, list) : list
}
