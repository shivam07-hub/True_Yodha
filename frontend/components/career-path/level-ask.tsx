"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { StepActions } from "@/components/journey/journey-chrome"
import { LevelStep } from "@/components/onboarding/target-steps"
import { StickyOnboardingActionBar } from "@/components/onboarding/sticky-action-bar"
import { invalidateTargetRoleData } from "@/lib/domain-data"
import { onboarding, type OnboardingResult, type TargetSeniority } from "@/lib/api"

type AwaitingTarget = Extract<OnboardingResult, { kind: "awaiting_target" }>

/**
 * A role already chosen, and no level. Asks the level and nothing else
 * (Shivam, 2026-10-27) — the work is shown, not asked again.
 *
 * The answer goes through `PUT /onboarding/target/level` → `targeting_write.commit`,
 * which mints the CareerTargetSnapshot the level was the last piece of; the gate
 * then lets the page through on the refetch.
 */
export function LevelAsk({ token, result }: { token: string; result: AwaitingTarget }) {
  const queryClient = useQueryClient()
  const [seniority, setSeniority] = useState<TargetSeniority | null>(
    result.selected?.seniority ?? result.seniority.value,
  )
  const [years, setYears] = useState<number | null>(
    result.selected?.years_experience ?? result.seniority.years ?? null,
  )
  const [yearsSource, setYearsSource] = useState<"user" | "cv" | null>(
    result.selected?.years_experience_source
      ?? (result.seniority.source === "experience_years" ? "cv" : null),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const roles = (result.selected?.families ?? []).map((pick) => pick.family)
  const level = seniority && seniority !== "any" ? seniority : null

  async function save() {
    if (!level || busy) return
    setBusy(true)
    setError(null)
    try {
      await onboarding.saveLevel(token, {
        seniority: level,
        // Only a number she set. A CV reading she left alone stays a reading.
        ...(years != null && yearsSource === "user" ? { years_experience: years } : {}),
      })
      // The career-path refetch carries the new snapshot; the gate then lets the page through.
      invalidateTargetRoleData(queryClient)
      setBusy(false)
    } catch (reason) {
      setBusy(false)
      setError(reason instanceof Error ? reason.message : "Could not save your level.")
    }
  }

  return (
    <section className="mx-auto w-full max-w-lg pb-40" aria-labelledby="level-ask-title">
      <span
        id="level-ask-title"
        className="font-mono text-[length:var(--tm-fs-micro)] uppercase tracking-[0.14em] text-[var(--tm-text-muted)]"
      >
        Direction
      </span>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Your role">
        {roles.map((role) => (
          <li
            key={role}
            className="rounded-full border border-[var(--tm-border-soft)] px-3 py-1 text-sm text-[var(--tm-text)]"
          >
            {role}
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <LevelStep
          evidence={result.seniority}
          value={level}
          years={years}
          yearsSource={yearsSource}
          onChange={setSeniority}
          onYearsChange={(next) => {
            setYears(next)
            setYearsSource("user")
          }}
        />
      </div>
      <StickyOnboardingActionBar contentClassName="box-content max-w-lg px-[var(--tm-page-px)] pt-3">
        <StepActions
          primaryLabel={busy ? "Saving" : "Save"}
          primaryDisabled={!level || busy}
          note={error ? <span role="alert" className="text-[var(--tm-danger)]">{error}</span> : null}
          onPrimary={() => void save()}
        />
      </StickyOnboardingActionBar>
    </section>
  )
}
