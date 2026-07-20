"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Check, Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { onboarding, skills, type OnboardingResult, type Skill } from "@/lib/api"

type Pending = Extract<OnboardingResult, { kind: "awaiting_skill_confirmation" }>

interface Addition {
  skill: Skill
  evidence: string
}

interface SkillConfirmationProps {
  token: string
  result: Pending
  onConfirmed: () => void
}

export function SkillConfirmation({ token, result, onConfirmed }: SkillConfirmationProps) {
  const catalogQuery = useQuery({ queryKey: ["skill-catalog"], queryFn: () => skills.all() })
  const catalog = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data])
  const byKey = useMemo(
    () => new Map(catalog.map((skill) => [skill.taxonomy_key, skill])),
    [catalog],
  )
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [missing, setMissing] = useState("")
  const [evidence, setEvidence] = useState("")
  const [additions, setAdditions] = useState<Addition[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const missingSkill = catalog.find(
    (skill) => skill.display_name.toLocaleLowerCase() === missing.trim().toLocaleLowerCase(),
  )
  const confirmedCount = result.skills.length - excluded.size + additions.length
  const hasUnmappedExclusion = Array.from(excluded).some((key) => !byKey.has(key))

  function toggleExcluded(key: string) {
    setExcluded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function addMissingSkill() {
    if (!missingSkill || evidence.trim().length < 5) return
    setAdditions((current) => [
      ...current.filter((item) => item.skill.id !== missingSkill.id),
      { skill: missingSkill, evidence: evidence.trim() },
    ])
    setMissing("")
    setEvidence("")
  }

  async function confirm() {
    if (busy || confirmedCount < 1) return
    const removals = result.skills.flatMap((item) => {
      const skill = byKey.get(item.taxonomy_key)
      if (!excluded.has(item.taxonomy_key) || !skill) return []
      return [{
        skill_id: skill.id,
        action: "exclude" as const,
        evidence_text: item.evidence || "User removed this extracted CV skill.",
      }]
    })
    const included = additions.map(({ skill, evidence: proof }) => ({
      skill_id: skill.id,
      action: "include" as const,
      evidence_text: proof,
    }))
    setBusy(true)
    setError(null)
    try {
      await onboarding.confirmSkills(token, result.baseline_version_id, [...removals, ...included])
      onConfirmed()
    } catch (reason) {
      setBusy(false)
      setError(reason instanceof Error ? reason.message : "Your skills could not be confirmed.")
    }
  }

  return (
    <section className="w-full max-w-2xl" aria-labelledby="skill-confirmation-title">
      <p className="text-sm font-semibold text-[var(--tm-interactive)]">Before Myro scores you</p>
      <h1 id="skill-confirmation-title" className="mt-2 text-3xl font-semibold tracking-normal text-[var(--tm-text)]">
        Confirm what we found in your CV
      </h1>
      <p className="mt-2 text-sm leading-6 text-[var(--tm-text-muted)]">
        Your score and job matches will use only the skills you confirm here.
      </p>

      <div className="mt-6 divide-y divide-[var(--tm-border-soft)] rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)]">
        {result.skills.map((item) => {
          const removed = excluded.has(item.taxonomy_key)
          return (
            <div key={item.taxonomy_key} className="flex items-start gap-3 p-4">
              <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--tm-bg)] ${removed ? "text-[var(--tm-danger)]" : "text-[var(--tm-success)]"}`}>
                {removed ? <X className="size-4" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium ${removed ? "line-through text-[var(--tm-text-muted)]" : "text-[var(--tm-text)]"}`}>{item.name}</span>
                {item.evidence && <span className="mt-1 block text-xs leading-5 text-[var(--tm-text-muted)]">{item.evidence}</span>}
              </span>
              <button type="button" onClick={() => toggleExcluded(item.taxonomy_key)} className="tm-control-focus min-h-10 rounded px-2 text-xs font-medium text-[var(--tm-text-muted)] hover:text-[var(--tm-text)]">
                {removed ? "Restore" : "Remove"}
              </button>
            </div>
          )
        })}
        {additions.map(({ skill, evidence: proof }) => (
          <div key={skill.id} className="flex items-start gap-3 p-4">
            <Plus className="mt-1 size-4 text-[var(--tm-interactive)]" aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{skill.display_name}</span><span className="mt-1 block text-xs text-[var(--tm-text-muted)]">{proof}</span></span>
            <button type="button" onClick={() => setAdditions((current) => current.filter((item) => item.skill.id !== skill.id))} className="tm-control-focus min-h-10 rounded px-2 text-xs font-medium">Remove</button>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-2 rounded-md border border-[var(--tm-border-soft)] p-4 sm:grid-cols-[1fr_1fr_auto]">
        <div><label htmlFor="missing-skill" className="text-xs font-medium uppercase tracking-wide text-[var(--tm-text-muted)]">Missing skill</label><input id="missing-skill" list="skill-catalog" value={missing} onChange={(event) => setMissing(event.target.value)} className="tm-control-focus mt-1 min-h-11 w-full rounded-md border border-[var(--tm-border)] bg-[var(--tm-bg)] px-3" /></div>
        <div><label htmlFor="missing-evidence" className="text-xs font-medium uppercase tracking-wide text-[var(--tm-text-muted)]">CV evidence</label><input id="missing-evidence" value={evidence} onChange={(event) => setEvidence(event.target.value)} className="tm-control-focus mt-1 min-h-11 w-full rounded-md border border-[var(--tm-border)] bg-[var(--tm-bg)] px-3" /></div>
        <Button variant="outline" className="min-h-11 self-end" disabled={!missingSkill || evidence.trim().length < 5} onClick={addMissingSkill}><Plus className="size-4" />Add</Button>
        <datalist id="skill-catalog">{catalog.map((skill) => <option key={skill.id} value={skill.display_name} />)}</datalist>
      </div>

      {(error || hasUnmappedExclusion) && <p role="alert" className="mt-3 text-sm text-[var(--tm-danger)]">{error || "Skill corrections are still loading. Please try again."}</p>}
      <Button size="lg" className="mt-6 min-h-12 w-full" disabled={busy || confirmedCount < 1 || hasUnmappedExclusion} onClick={() => void confirm()}>
        {busy ? "Confirming…" : `Confirm ${confirmedCount} skills`}
      </Button>
    </section>
  )
}
