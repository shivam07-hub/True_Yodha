"use client"

import { useState } from "react"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BandPercentileLine } from "@/components/skills/band-percentile-line"
import { ScoreExplanation } from "@/components/onboarding/score-explanation"
import { onboarding, type OnboardingResult, type TargetSeniority } from "@/lib/api"

type AwaitingTarget = Extract<OnboardingResult, { kind: "awaiting_target" }>

interface Props {
  token: string
  result: AwaitingTarget
  /** Called after saveTarget lands — parent refetches the result (→ reveal). */
  onConfirmed: () => void
}

const SENIORITIES: { value: TargetSeniority; label: string }[] = [
  { value: "intern", label: "Internship" },
  { value: "entry", label: "Entry-level" },
  { value: "mid", label: "Mid-level" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" },
  { value: "executive", label: "Executive" },
]

/**
 * Score-first onboarding reveal (Slice 4): the CV is scored the moment it's
 * parsed, so the number lands first. The target is pre-filled from the parsed
 * CV and confirmed in ONE tap — no separate blocking form. Matching runs only
 * on Confirm, so a weak/empty role never yields junk matches.
 */
export function TargetConfirm({ token, result, onConfirmed }: Props) {
  const suggested = result.suggestion
  const [role, setRole] = useState(suggested.role)
  const [seniority, setSeniority] = useState<TargetSeniority>(
    (SENIORITIES.some((s) => s.value === suggested.seniority) ? suggested.seniority : "entry") as TargetSeniority,
  )
  const [location, setLocation] = useState(suggested.location)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roleReady = role.trim().length >= 2

  async function confirm() {
    if (!roleReady || busy) return
    setBusy(true)
    setError(null)
    try {
      await onboarding.saveTarget(token, {
        role_title: role.trim(),
        seniority,
        location: location.trim() || undefined,
      })
      onConfirmed()
    } catch (reason) {
      setBusy(false)
      setError(reason instanceof Error ? reason.message : "Could not save your target.")
    }
  }

  return (
    <section className="w-full max-w-lg" aria-labelledby="score-title">
      <p className="text-sm font-semibold text-[var(--tm-interactive)]">Your Myro Score</p>
      <div className="mt-2 flex items-baseline gap-3">
        <span id="score-title" className="text-6xl font-semibold tabular-nums leading-none text-[var(--tm-text)]">
          {Math.round(result.score.total_score)}
        </span>
        <BandPercentileLine band={result.score.band} topPercent={result.score.top_percent} />
      </div>

      <div className="mt-6"><ScoreExplanation factors={result.score_factors} /></div>

      <div className="mt-6 rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)] p-5">
        <p className="text-base font-medium text-[var(--tm-text)]">
          Confirm your target to see matches
        </p>
        <p className="mt-1 text-sm text-[var(--tm-text-muted)]">
          Pulled from your CV — edit anything that&apos;s off.
        </p>

        <label htmlFor="tc-role" className="mt-4 block text-xs font-medium uppercase tracking-wide text-[var(--tm-text-muted)]">Target role</label>
        <input
          id="tc-role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="e.g. Data Analyst"
          className="tm-control-focus mt-1 min-h-11 w-full rounded-md border border-[var(--tm-border)] bg-[var(--tm-bg)] px-3 text-base text-[var(--tm-text)] placeholder:text-[var(--tm-text-faint)]"
        />

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="tc-seniority" className="block text-xs font-medium uppercase tracking-wide text-[var(--tm-text-muted)]">Seniority</label>
            <select
              id="tc-seniority"
              value={seniority}
              onChange={(e) => setSeniority(e.target.value as TargetSeniority)}
              className="tm-control-focus mt-1 min-h-11 w-full rounded-md border border-[var(--tm-border)] bg-[var(--tm-bg)] px-3 text-base text-[var(--tm-text)]"
            >
              {SENIORITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="tc-location" className="block text-xs font-medium uppercase tracking-wide text-[var(--tm-text-muted)]">Location</label>
            <input
              id="tc-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Optional"
              className="tm-control-focus mt-1 min-h-11 w-full rounded-md border border-[var(--tm-border)] bg-[var(--tm-bg)] px-3 text-base text-[var(--tm-text)] placeholder:text-[var(--tm-text-faint)]"
            />
          </div>
        </div>

        {error && <p role="alert" className="mt-3 text-sm text-[var(--tm-danger)]">{error}</p>}

        <Button size="lg" className="mt-4 min-h-12 w-full" disabled={!roleReady || busy} onClick={() => void confirm()}>
          {busy ? "Finding your matches…" : <>Confirm &amp; see matches <ArrowRight className="size-5" /></>}
        </Button>
      </div>
    </section>
  )
}
