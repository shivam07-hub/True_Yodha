"use client"

/**
 * The four screens of onboarding's Direction step.
 *
 * Split out of `target-confirm.tsx`, which asked all four at once: a list of
 * role families, a level, a set of cities, lean/avoid, and a Myro name, stacked
 * down one page under a sticky bar. That is the same defect Myro Search had —
 * every decision on screen at once, the primary action at the bottom of it —
 * and it was about to be fixed there and left here.
 *
 * These are presentational. State, the API call and the step machine stay in
 * `target-confirm.tsx`; the chrome (ribbon, head, actions) is shared with Myro
 * Search in `components/journey/journey-chrome.tsx`.
 */

import { Check, Search } from "lucide-react"

import { DirectionChoice } from "@/components/onboarding/direction-choice"
import { LocationChoice } from "@/components/onboarding/location-choice"
import { StepHead } from "@/components/journey/journey-chrome"
import { formatCount } from "@/lib/format"
import type { RoleFamily, TargetSeniority } from "@/lib/api"
import { cn } from "@/lib/utils"

export const MAX_ROLES = 3
export const MAX_LOCATIONS = 3

const SENIORITY_LABEL: Record<Exclude<TargetSeniority, "any">, string> = {
  intern: "Internship", entry: "Entry-level", mid: "Mid-level",
  senior: "Senior", lead: "Lead", executive: "Executive",
}

/** The remembering, in the one place onboarding can honestly claim it: what
 *  Myro read off the CV before asking anything. */
function seniorityEvidence(result: { source: string; years?: number | null; title?: string | null }): string {
  if (result.source === "experience_years") return `${result.years} yrs of experience, read from your CV.`
  if (result.source === "title") return `Read from “${result.title}” in your CV.`
  return "Your CV did not say, so this one is yours to set."
}

export function RoleStep({
  families, selected, showSearch, roleSearch, empty,
  onToggle, onShowSearch, onSearch,
}: {
  families: RoleFamily[]
  selected: RoleFamily[]
  showSearch: boolean
  roleSearch: string
  /** Nothing suggested and nothing searched — say so rather than showing a
   *  blank column under a title. */
  empty: boolean
  onToggle: (family: RoleFamily) => void
  onShowSearch: (open: boolean) => void
  onSearch: (term: string) => void
}) {
  const full = selected.length >= MAX_ROLES
  return (
    <>
      <StepHead
        title="The work"
        lede={`Up to ${MAX_ROLES} kinds of work you want next. Myro searches on these.`}
      />
      <div className="mt-6 space-y-2">
        {families.map((family) => {
          const picked = selected.some((p) => p.family === family.family)
          return (
            <button
              key={family.family}
              type="button"
              onClick={() => onToggle(family)}
              disabled={full && !picked}
              aria-pressed={picked}
              className={cn(
                "tm-control-focus flex min-h-14 w-full items-start justify-between gap-3 rounded-md border px-4 py-3 text-left",
                picked
                  ? "border-[var(--tm-interactive)] bg-[var(--tm-int-bg-wash)]"
                  : "border-[var(--tm-border-soft)] bg-[var(--tm-surface)]",
                full && !picked && "opacity-45",
              )}
            >
              <span className="min-w-0">
                <span className="block text-base font-medium text-[var(--tm-text)]">{family.label}</span>
                <span className="mt-1 block text-pretty text-sm text-[var(--tm-text-muted)]">
                  {formatCount(family.open_count)} open · {family.matched_skill_count} of your skills
                </span>
              </span>
              {picked ? <Check className="mt-1 size-4 shrink-0 text-[var(--tm-interactive)]" /> : null}
            </button>
          )
        })}
        {empty ? (
          <p className="text-sm text-[var(--tm-text-muted)]">Search the roles Myro is currently tracking.</p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => onShowSearch(!showSearch)}
        className="tm-control-focus mt-4 inline-flex min-h-10 items-center gap-2 rounded text-sm text-[var(--tm-text-muted)] underline underline-offset-4"
      >
        <Search className="size-4" />
        Search another role
      </button>
      {showSearch ? (
        <input
          value={roleSearch}
          onChange={(e) => onSearch(e.target.value)}
          autoFocus
          placeholder="Search a role"
          aria-label="Search another role"
          className="tm-control-focus mt-2 min-h-11 w-full rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)] px-3 text-[var(--tm-text)] placeholder:text-[var(--tm-text-muted)]"
        />
      ) : null}
    </>
  )
}

export function LevelStep({
  evidence, value, onChange,
}: {
  evidence: { source: string; years?: number | null; title?: string | null }
  value: TargetSeniority | null
  onChange: (value: TargetSeniority) => void
}) {
  return (
    <>
      <StepHead
        recall={seniorityEvidence(evidence)}
        title="Level"
        lede="Roles above this are noise; roles below it are a step back."
      />
      <div className="mt-6 flex flex-wrap gap-2">
        {Object.entries(SENIORITY_LABEL).map(([key, name]) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key as TargetSeniority)}
            aria-pressed={value === key}
            className={cn(
              "tm-control-focus min-h-11 rounded-md border px-3 text-sm",
              value === key
                ? "border-[var(--tm-interactive)] bg-[var(--tm-interactive)] text-[var(--tm-interactive-fg)]"
                : "border-[var(--tm-border)] bg-[var(--tm-surface)] text-[var(--tm-text-muted)]",
            )}
          >
            {name}
          </button>
        ))}
      </div>
    </>
  )
}

export function WhereStep({
  totalOpen, options, selected, onChange,
}: {
  totalOpen: number
  options: { location: string; open_count: number }[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <>
      <StepHead
        title="Where"
        lede={`Up to ${MAX_LOCATIONS} cities you would actually move for, or remote. Leave it open and Myro searches everywhere.`}
      />
      <LocationChoice
        totalOpen={totalOpen}
        options={options}
        selected={selected}
        max={MAX_LOCATIONS}
        onChange={onChange}
      />
    </>
  )
}

const NAME_HINT = "3–32 characters, lowercase letters, numbers, dashes."

export function DirectionStep({
  lean, avoid, proposed, onDirection,
  ninja, ninjaClaimed, onNinja,
}: {
  lean: string[]
  avoid: string[]
  proposed: Array<"avoid" | "lean">
  onDirection: (next: { lean: string[]; avoid: string[] }) => void
  ninja: string
  ninjaClaimed: boolean
  onNinja: (value: string) => void
}) {
  return (
    <>
      <StepHead
        title="About you"
        lede="What pulls you toward a role, what you would turn down, and the name you show up under."
      />
      <DirectionChoice lean={lean} avoid={avoid} proposed={proposed} onChange={onDirection} />

      <section className="mt-7" aria-labelledby="ninja-name-title">
        <p id="ninja-name-title" className="text-sm font-medium text-[var(--tm-text)]">Your Myro name</p>
        <p className="mt-1 text-pretty text-sm text-[var(--tm-text-muted)]">
          How you show up on public surfaces. Funny, weird, or straight — yours to claim.
        </p>
        {ninjaClaimed ? (
          <p className="mt-3 font-mono text-sm text-[var(--tm-text)]">himyro.com/profile/{ninja}</p>
        ) : (
          <>
            <label htmlFor="direction-ninja-name" className="mt-3 block text-xs text-[var(--tm-text-muted)]">
              himyro.com/profile/
            </label>
            <input
              id="direction-ninja-name"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={ninja}
              onChange={(e) => onNinja(e.target.value.toLowerCase())}
              maxLength={32}
              aria-describedby="direction-ninja-hint"
              className="tm-control-focus mt-1 min-h-11 w-full rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)] px-3 font-mono text-[var(--tm-text)]"
            />
            <p id="direction-ninja-hint" className="mt-1 text-xs text-[var(--tm-text-muted)]">{NAME_HINT}</p>
          </>
        )}
      </section>
    </>
  )
}
