"use client"

import { useEffect, useState } from "react"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { jobs, type OnboardingTarget, type TargetSeniority } from "@/lib/api"

const SENIORITIES: Array<{ value: TargetSeniority; label: string }> = [
  { value: "intern", label: "Intern" }, { value: "entry", label: "Entry" },
  { value: "mid", label: "Mid" }, { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" }, { value: "executive", label: "Executive" },
  { value: "any", label: "Any" },
]

interface Props {
  initial?: Partial<OnboardingTarget>
  busy: boolean
  analysisPhase?: string | null
  error: string | null
  onSubmit: (target: OnboardingTarget) => void
  onBack: () => void
  onBrowse: () => void
}

export function TargetStep({ initial, busy, analysisPhase, error, onSubmit, onBack, onBrowse }: Props) {
  const [role, setRole] = useState(initial?.role_title ?? "")
  const [seniority, setSeniority] = useState<TargetSeniority>(initial?.seniority ?? "any")
  const [location, setLocation] = useState(initial?.location ?? "")
  const [roleSuggestions, setRoleSuggestions] = useState<string[]>([])

  useEffect(() => {
    if (initial?.role_title) setRole(initial.role_title)
    if (initial?.seniority) setSeniority(initial.seniority)
    if (initial?.location) setLocation(initial.location)
  }, [initial])

  useEffect(() => {
    if (role.trim().length < 2) { setRoleSuggestions([]); return }
    let active = true
    const timer = window.setTimeout(() => {
      void jobs.globalSearch(role.trim(), 12).then((response) => {
        if (active) setRoleSuggestions(Array.from(new Set(response.hits.map((hit) => hit.job_title))))
      }).catch(() => { if (active) setRoleSuggestions([]) })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [role])

  const valid = role.trim().length >= 2 && location.trim().length >= 2

  return (
    <section className="w-full max-w-xl" aria-labelledby="target-title">
      <h1 id="target-title" className="text-balance text-3xl font-semibold tracking-normal text-[var(--tm-text)]">What are you aiming for?</h1>
      <p className="mt-2 text-base leading-6 text-[var(--tm-text-muted)]">One target keeps your first score and matches focused.</p>

      {analysisPhase && (
        <div className="mt-5 flex items-center gap-3 rounded-md border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] px-4 py-3" role="status">
          <span className="size-4 animate-spin rounded-full border-2 border-[var(--tm-border)] border-t-[var(--tm-interactive)]" aria-hidden="true" />
          <span className="text-sm text-[var(--tm-text-muted)]">CV analysis: {analysisPhase.replaceAll("_", " ")}</span>
        </div>
      )}

      <form className="mt-6 space-y-5" onSubmit={(event) => { event.preventDefault(); if (valid) onSubmit({ role_title: role.trim(), seniority, location: location.trim() }) }}>
        <div>
          <label htmlFor="target-role" className="text-sm font-medium text-[var(--tm-text)]">Primary role</label>
          <input id="target-role" list="target-role-suggestions" value={role} onChange={(event) => setRole(event.target.value)} placeholder="Product Manager" autoComplete="organization-title" className="tm-control-focus mt-2 min-h-12 w-full rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)] px-3 text-base text-[var(--tm-text)]" />
          <datalist id="target-role-suggestions">{roleSuggestions.map((title) => <option key={title} value={title} />)}</datalist>
        </div>
        <fieldset>
          <legend className="text-sm font-medium text-[var(--tm-text)]">Seniority</legend>
          <div className="mt-2 grid grid-cols-4 gap-2 max-[430px]:grid-cols-3">
            {SENIORITIES.map((item) => (
              <label key={item.value} className={`tm-control-focus flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-2 text-sm ${seniority === item.value ? "border-[var(--tm-interactive)] bg-[var(--tm-int-bg-wash)] font-semibold text-[var(--tm-text)]" : "border-[var(--tm-border)] text-[var(--tm-text-muted)]"}`}>
                <input type="radio" name="seniority" value={item.value} checked={seniority === item.value} onChange={() => setSeniority(item.value)} className="sr-only" />{item.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="target-location" className="text-sm font-medium text-[var(--tm-text)]">Location or remote preference</label>
          <input id="target-location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Bengaluru, India or Remote India" autoComplete="address-level2" className="tm-control-focus mt-2 min-h-12 w-full rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)] px-3 text-base text-[var(--tm-text)]" />
        </div>
        {error && <p role="alert" className="text-sm text-[var(--tm-danger)]">{error}</p>}
        <Button type="submit" disabled={!valid || busy} className="min-h-12 w-full">{busy ? "Saving target..." : "See my result"}<ArrowRight className="size-4" aria-hidden="true" /></Button>
      </form>
      <div className="mt-4 flex items-center justify-between">
        <button type="button" onClick={onBack} className="tm-control-focus rounded px-3 py-2 text-sm text-[var(--tm-text-muted)]">Back</button>
        <button type="button" onClick={onBrowse} className="tm-control-focus rounded px-3 py-2 text-sm text-[var(--tm-text-muted)] underline-offset-4 hover:underline">Browse jobs instead</button>
      </div>
    </section>
  )
}
