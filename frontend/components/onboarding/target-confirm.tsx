"use client"

import { useState } from "react"
import { ArrowLeft, Check, Search } from "lucide-react"
import { useQueries, useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { StickyOnboardingActionBar } from "@/components/onboarding/sticky-action-bar"
import { DirectionChoice } from "@/components/onboarding/direction-choice"
import { formatCount } from "@/lib/format"
import { onboarding, type OnboardingResult, type RoleFamily, type TargetSeniority } from "@/lib/api"
import { trackEvent } from "@/lib/analytics"
import { cn } from "@/lib/utils"

type AwaitingTarget = Extract<OnboardingResult, { kind: "awaiting_target" }>
type Props = {
  token: string
  result: AwaitingTarget
  onConfirmed: () => void
  /** Review the previous step. Non-destructive — nothing here is cleared. */
  onBack?: () => void
  /** Return to where the user actually is, leaving this answer untouched. */
  onForward?: () => void
}

/** Both axes are plural end-to-end (`target_role_titles`, `target_locations`). */
const MAX_ROLES = 3
const MAX_LOCATIONS = 3

const SENIORITY_LABEL: Record<Exclude<TargetSeniority, "any">, string> = {
  intern: "Internship", entry: "Entry-level", mid: "Mid-level", senior: "Senior", lead: "Lead", executive: "Executive",
}

function SeniorityChoice({ result, value, onChange }: {
  result: AwaitingTarget["seniority"]
  value: TargetSeniority | null
  onChange: (value: TargetSeniority) => void
}) {
  const evidence = result.source === "experience_years"
    ? `${result.years} yrs of experience read from your CV`
    : result.source === "title" ? `Read from “${result.title}” in your CV` : "We couldn’t tell from your CV."
  return <section className="mt-7" aria-labelledby="target-level">
    <p id="target-level" className="text-sm font-medium text-[var(--tm-text)]">What level are you looking for?</p>
    <p className="mt-1 text-pretty text-sm text-[var(--tm-text-muted)]">{evidence}</p>
    <div className="mt-3 flex flex-wrap gap-2">{Object.entries(SENIORITY_LABEL).map(([key, name]) => <button key={key} type="button" onClick={() => onChange(key as TargetSeniority)} aria-pressed={value === key} className={cn("tm-control-focus min-h-11 rounded-md border px-3 text-sm", value === key ? "border-[var(--tm-interactive)] bg-[var(--tm-interactive)] text-[var(--tm-interactive-fg)]" : "border-[var(--tm-border)] bg-[var(--tm-surface)] text-[var(--tm-text-muted)]")}>{name}</button>)}</div>
  </section>
}

function FamilyRow({ family, selected, disabled, onChoose }: {
  family: RoleFamily; selected: boolean; disabled: boolean; onChoose: () => void
}) {
  return <button
    type="button"
    onClick={onChoose}
    disabled={disabled}
    aria-pressed={selected}
    className={cn(
      "tm-control-focus flex min-h-14 w-full items-start justify-between gap-3 rounded-md border px-4 py-3 text-left",
      selected ? "border-[var(--tm-interactive)] bg-[var(--tm-int-bg-wash)]" : "border-[var(--tm-border-soft)] bg-[var(--tm-surface)]",
      disabled && "opacity-45",
    )}
  >
    <span className="min-w-0">
      <span className="block text-base font-medium text-[var(--tm-text)]">{family.label}</span>
      <span className="mt-1 block text-pretty text-sm text-[var(--tm-text-muted)]">{formatCount(family.open_count)} open · {family.matched_skill_count} of your skills</span>
    </span>
    {selected && <Check className="mt-1 size-4 shrink-0 text-[var(--tm-interactive)]" />}
  </button>
}

/** The targeting step is deliberately score-free: its selected cohort creates the score. */
export function TargetConfirm({ token, result, onConfirmed, onBack, onForward }: Props) {
  // Seeded from what the user already chose, so stepping back here shows their
  // direction rather than an empty form they have to reconstruct.
  const [selected, setSelected] = useState<RoleFamily[]>(result.selected?.families ?? [])
  const [roleSearch, setRoleSearch] = useState("")
  const [showSearch, setShowSearch] = useState(false)
  const [locations, setLocations] = useState<string[]>(result.selected?.locations ?? [])
  // Seeded from Myro's reading when the user has not answered this yet, so the
  // first act here is a correction rather than composing from nothing.
  const [lean, setLean] = useState<string[]>(result.direction?.lean ?? [])
  const [avoid, setAvoid] = useState<string[]>(result.direction?.avoid ?? [])
  const [seniority, setSeniority] = useState<TargetSeniority | null>(
    result.selected?.seniority ?? result.seniority.value,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const searchedFamilies = useQuery({ queryKey: ["role-families", roleSearch], queryFn: () => onboarding.roleFamilies(token, roleSearch), enabled: showSearch && roleSearch.trim().length >= 2 })
  // One query per chosen family, then merged: a user targeting two families
  // should see the cities that hire for either, not just the first one picked.
  const locationQueries = useQueries({
    queries: selected.map((family) => ({
      queryKey: ["role-family-locations", family.family],
      queryFn: () => onboarding.roleFamilyLocations(token, family.family),
    })),
  })
  const locationOptions = (() => {
    const byName = new Map<string, number>()
    for (const query of locationQueries) {
      for (const option of query.data ?? []) {
        byName.set(option.location, (byName.get(option.location) ?? 0) + option.open_count)
      }
    }
    return Array.from(byName.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([location, open_count]) => ({ location, open_count }))
  })()

  const searching = showSearch && roleSearch.trim().length >= 2
  // Chosen families stay visible while searching, so a pick made from search
  // results can't scroll out of existence and look un-selected.
  const listed = searching ? (searchedFamilies.data ?? []) : result.families
  const families = [...selected, ...listed.filter((row) => !selected.some((pick) => pick.family === row.family))]
  const totalOpen = selected.reduce((sum, family) => sum + family.open_count, 0)
  const rolesFull = selected.length >= MAX_ROLES

  function toggleFamily(family: RoleFamily) {
    setError(null)
    setSelected((current) => {
      const without = current.filter((pick) => pick.family !== family.family)
      if (without.length !== current.length) return without
      if (current.length >= MAX_ROLES) return current
      return [...current, family]
    })
    setLocations([])
  }

  function toggleLocation(location: string) {
    setLocations((current) =>
      current.includes(location)
        ? current.filter((value) => value !== location)
        : current.length >= MAX_LOCATIONS ? current : [...current, location],
    )
  }

  async function submit() {
    if (!selected.length || !seniority || busy) return
    setBusy(true); setError(null)
    try {
      await onboarding.saveTarget(token, {
        role_titles: selected.map((family) => family.label),
        role_families: selected.map((family) => family.family),
        seniority,
        // Always sent, including `[]` — that is "Anywhere", a real choice.
        locations,
        // Also always sent: pressing confirm with a proposed phrase still on
        // screen is the user accepting it, and clearing one is a real answer.
        lean,
        avoid,
      })
      trackEvent("onboarding_direction_confirmed", {
        role_count: selected.length,
        location_count: locations.length,
        lean_count: lean.length,
        avoid_count: avoid.length,
      })
      onConfirmed()
    } catch (reason) {
      setBusy(false); setError(reason instanceof Error ? reason.message : "Could not save your target.")
    }
  }

  return <section className="w-full max-w-lg pb-28" aria-labelledby="target-title">
    {onBack && <button type="button" onClick={onBack} className="tm-control-focus -ml-1 mb-3 inline-flex min-h-9 items-center gap-1.5 rounded px-1 text-sm text-[var(--tm-text-muted)]"><ArrowLeft className="size-4" />Your CV</button>}
    <h1 id="target-title" className="text-balance text-3xl font-semibold text-[var(--tm-text)] sm:text-4xl">Choose your direction</h1>
    <p className="mt-2 text-sm leading-6 text-[var(--tm-text-muted)]">Pick up to {MAX_ROLES} kinds of work you want next.</p>

    <div className="mt-6 space-y-2">
      {families.map(family => {
        const isSelected = selected.some((pick) => pick.family === family.family)
        return <FamilyRow
          key={family.family}
          family={family}
          selected={isSelected}
          disabled={rolesFull && !isSelected}
          onChoose={() => toggleFamily(family)}
        />
      })}
      {!showSearch && result.families.length === 0 && <p className="text-sm text-[var(--tm-text-muted)]">Search the roles Myro is currently tracking.</p>}
    </div>

    <button type="button" onClick={() => setShowSearch(value => !value)} className="tm-control-focus mt-4 inline-flex min-h-10 items-center gap-2 rounded text-sm text-[var(--tm-text-muted)] underline underline-offset-4"><Search className="size-4" />Search another role</button>
    {showSearch && <input value={roleSearch} onChange={event => setRoleSearch(event.target.value)} autoFocus placeholder="Search a role" aria-label="Search another role" className="tm-control-focus mt-2 min-h-11 w-full rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)] px-3 text-[var(--tm-text)] placeholder:text-[var(--tm-text-faint)]" />}

    <SeniorityChoice result={result.seniority} value={seniority} onChange={setSeniority} />

    {selected.length > 0 && <section className="mt-7" aria-labelledby="target-location">
      <p id="target-location" className="text-sm font-medium text-[var(--tm-text)]">Where? <span className="font-normal text-[var(--tm-text-muted)]">Up to {MAX_LOCATIONS}, or leave empty for anywhere.</span></p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setLocations([])}
          aria-pressed={locations.length === 0}
          className={cn("tm-control-focus min-h-11 rounded-md border px-3 text-sm", locations.length === 0 ? "border-[var(--tm-interactive)] bg-[var(--tm-interactive)] text-[var(--tm-interactive-fg)]" : "border-[var(--tm-border)] bg-[var(--tm-surface)] text-[var(--tm-text-muted)]")}
        >
          Anywhere · {formatCount(totalOpen)}
        </button>
        {locationOptions.map(option => {
          const picked = locations.includes(option.location)
          return <button
            key={option.location}
            type="button"
            onClick={() => toggleLocation(option.location)}
            aria-pressed={picked}
            disabled={!picked && locations.length >= MAX_LOCATIONS}
            className={cn(
              "tm-control-focus min-h-11 rounded-md border px-3 text-sm",
              picked ? "border-[var(--tm-interactive)] bg-[var(--tm-interactive)] text-[var(--tm-interactive-fg)]" : "border-[var(--tm-border)] bg-[var(--tm-surface)] text-[var(--tm-text-muted)]",
              !picked && locations.length >= MAX_LOCATIONS && "opacity-45",
            )}
          >
            {option.location} · {formatCount(option.open_count)}{option.open_count < 10 ? " · thin" : ""}
          </button>
        })}
      </div>
    </section>}

    {selected.length > 0 && <DirectionChoice
      lean={lean}
      avoid={avoid}
      proposed={result.direction?.proposed ?? []}
      onChange={(next) => { setLean(next.lean); setAvoid(next.avoid) }}
    />}

    <StickyOnboardingActionBar error={error} contentClassName="max-w-lg px-5 pt-3 sm:px-8">
      {/* Only offered to someone who already HAS a shortlist — it returns them to
          it untouched, which is the whole point of a review being free. */}
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button size="lg" className="min-h-12 w-full" disabled={!selected.length || !seniority || busy} onClick={() => void submit()}>
          {busy ? "Building your shortlist…" : !selected.length ? "Choose a role to continue" : !seniority ? "Choose a level to continue" : "Show my first shortlist →"}
        </Button>
        {onForward && <Button variant="ghost" size="lg" className="min-h-12 w-full sm:w-auto" onClick={onForward}>Back to my shortlist</Button>}
      </div>
    </StickyOnboardingActionBar>
  </section>
}
