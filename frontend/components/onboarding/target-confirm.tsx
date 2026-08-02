"use client"

import { useState } from "react"
import { Check, Search } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { formatCount } from "@/lib/format"
import { onboarding, type OnboardingResult, type RoleFamily, type TargetSeniority } from "@/lib/api"
import { trackEvent } from "@/lib/analytics"
import { cn } from "@/lib/utils"

type AwaitingTarget = Extract<OnboardingResult, { kind: "awaiting_target" }>
type Props = { token: string; result: AwaitingTarget; onConfirmed: () => void }

const SENIORITY_LABEL: Record<Exclude<TargetSeniority, "any">, string> = {
  intern: "Internship", entry: "Entry-level", mid: "Mid-level", senior: "Senior", lead: "Lead", executive: "Executive",
}

function SeniorityChoice({ result, value, onChange }: {
  result: AwaitingTarget["seniority"]
  value: TargetSeniority | null
  onChange: (value: TargetSeniority) => void
}) {
  const [editing, setEditing] = useState(result.needs_choice)
  const label = value && value !== "any" ? SENIORITY_LABEL[value] : null
  const evidence = result.source === "experience_years"
    ? `${label} · ${result.years} yrs of experience read from your CV`
    : result.source === "title" ? `${label} · read from “${result.title}”` : "What level are you targeting? We couldn’t tell from your CV."
  return <section className="mt-7" aria-labelledby="target-level">
    <div className="flex items-center gap-3"><p id="target-level" className="text-sm font-medium text-[var(--tm-text)]">{evidence}</p>{!editing && <button type="button" onClick={() => setEditing(true)} className="tm-control-focus rounded text-sm text-[var(--tm-text-muted)] underline underline-offset-4">change</button>}</div>
    {editing && <div className="mt-3 flex flex-wrap gap-2">{Object.entries(SENIORITY_LABEL).map(([key, name]) => <button key={key} type="button" onClick={() => { onChange(key as TargetSeniority); setEditing(false) }} className={cn("tm-control-focus min-h-11 rounded-md border px-3 text-sm", value === key ? "border-[var(--tm-interactive)] bg-[var(--tm-interactive)] text-[var(--tm-interactive-fg)]" : "border-[var(--tm-border)] bg-[var(--tm-surface)] text-[var(--tm-text-muted)]")}>{name}</button>)}</div>}
  </section>
}

function FamilyRow({ family, selected, onChoose }: { family: RoleFamily; selected: boolean; onChoose: () => void }) {
  return <button type="button" onClick={onChoose} aria-pressed={selected} className={cn("tm-control-focus flex min-h-14 w-full items-start justify-between gap-3 rounded-md border px-4 py-3 text-left", selected ? "border-[var(--tm-interactive)] bg-[var(--tm-int-bg-wash)]" : "border-[var(--tm-border-soft)] bg-[var(--tm-surface)]")}><span className="min-w-0"><span className="block text-base font-medium text-[var(--tm-text)]">{family.label}</span><span className="mt-1 block text-pretty text-sm text-[var(--tm-text-muted)]">{formatCount(family.open_count)} open · {family.matched_skill_count} of your skills</span></span>{selected && <Check className="mt-1 size-4 shrink-0 text-[var(--tm-interactive)]" />}</button>
}

/** The targeting step is deliberately score-free: its selected cohort creates the score. */
export function TargetConfirm({ token, result, onConfirmed }: Props) {
  const [selected, setSelected] = useState<RoleFamily | null>(null)
  const [roleSearch, setRoleSearch] = useState("")
  const [showSearch, setShowSearch] = useState(false)
  const [location, setLocation] = useState("")
  const [seniority, setSeniority] = useState<TargetSeniority | null>(result.seniority.value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchedFamilies = useQuery({ queryKey: ["role-families", roleSearch], queryFn: () => onboarding.roleFamilies(token, roleSearch), enabled: showSearch && roleSearch.trim().length >= 2 })
  const locations = useQuery({ queryKey: ["role-family-locations", selected?.family], queryFn: () => onboarding.roleFamilyLocations(token, selected!.family), enabled: Boolean(selected) })
  const families = showSearch && roleSearch.trim().length >= 2 ? (searchedFamilies.data ?? []) : result.families

  async function submit() {
    if (!selected || !seniority || busy) return
    setBusy(true); setError(null)
    try {
      await onboarding.saveTarget(token, { role_title: selected.label, role_family: selected.family, seniority, location: location || undefined })
      trackEvent("onboarding_direction_confirmed")
      onConfirmed()
    } catch (reason) {
      setBusy(false); setError(reason instanceof Error ? reason.message : "Could not save your target.")
    }
  }

  return <section className="w-full max-w-lg" aria-labelledby="target-title">
    <p className="text-sm font-semibold text-[var(--tm-interactive)]">Step 2 of 3</p><h1 id="target-title" className="mt-2 text-balance text-3xl font-semibold text-[var(--tm-text)] sm:text-4xl">Choose your direction</h1>
    <p className="mt-3 text-pretty text-sm leading-6 text-[var(--tm-text-muted)]">Pick the kind of work you want next. Myro will use it to build a relevant live shortlist.</p>
    <div className="mt-6 space-y-2">{families.map(family => <FamilyRow key={family.family} family={family} selected={selected?.family === family.family} onChoose={() => { setSelected(family); setLocation("") }} />)}{!showSearch && result.families.length === 0 && <p className="text-sm text-[var(--tm-text-muted)]">Search the roles Myro is currently tracking.</p>}</div>
    <button type="button" onClick={() => setShowSearch(value => !value)} className="tm-control-focus mt-4 inline-flex min-h-10 items-center gap-2 rounded text-sm text-[var(--tm-text-muted)] underline underline-offset-4"><Search className="size-4" />Search another role</button>
    {showSearch && <input value={roleSearch} onChange={event => setRoleSearch(event.target.value)} autoFocus placeholder="Search a role" aria-label="Search another role" className="tm-control-focus mt-2 min-h-11 w-full rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)] px-3 text-[var(--tm-text)] placeholder:text-[var(--tm-text-faint)]" />}
    <SeniorityChoice result={result.seniority} value={seniority} onChange={setSeniority} />
    {selected && <section className="mt-7" aria-labelledby="target-location"><p id="target-location" className="text-sm font-medium text-[var(--tm-text)]">Where?</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setLocation("")} className={cn("tm-control-focus min-h-11 rounded-md border px-3 text-sm", !location ? "border-[var(--tm-interactive)] bg-[var(--tm-interactive)] text-[var(--tm-interactive-fg)]" : "border-[var(--tm-border)] bg-[var(--tm-surface)] text-[var(--tm-text-muted)]")}>Anywhere · {formatCount(selected.open_count)}</button>{(locations.data ?? []).map(option => <button key={`${option.is_remote}-${option.location}`} type="button" onClick={() => setLocation(option.location)} className={cn("tm-control-focus min-h-11 rounded-md border px-3 text-sm", location === option.location ? "border-[var(--tm-interactive)] bg-[var(--tm-interactive)] text-[var(--tm-interactive-fg)]" : "border-[var(--tm-border)] bg-[var(--tm-surface)] text-[var(--tm-text-muted)]")}>{option.location} · {formatCount(option.open_count)}{option.open_count < 10 ? " · thin" : ""}</button>)}</div></section>}
    {error && <p role="alert" className="mt-4 text-sm text-[var(--tm-danger)]">{error}</p>}
    <Button size="lg" className="mt-8 min-h-12 w-full" disabled={!selected || !seniority || busy} onClick={() => void submit()}>{busy ? "Building your shortlist…" : !selected ? "Choose a role to continue" : !seniority ? "Choose a level to continue" : "Show my first shortlist →"}</Button>
  </section>
}
