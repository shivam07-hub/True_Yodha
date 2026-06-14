"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import type { JobFeedSort } from "@/lib/api"
import {
  type FeedFilters, SORT_TOGGLE, canRankByFit, activeFilterCount,
} from "./feed-types"

// ── the control row: rank toggle · Filters button · Saved ─────────────────────

export function FeedControls({
  filters, onChange, hasCv, hasTargetRoles, savedCount, onOpenSaved, onOpenFilters,
}: {
  filters: FeedFilters
  onChange: (f: FeedFilters) => void
  hasCv: boolean
  hasTargetRoles: boolean
  savedCount: number
  onOpenSaved: () => void
  onOpenFilters: () => void
}) {
  const n = activeFilterCount(filters)
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <SortToggle
        sort={filters.sort}
        onSort={s => onChange({ ...filters, sort: s })}
        canFit={canRankByFit(hasCv, hasTargetRoles)}
      />
      <button type="button" onClick={onOpenFilters} className="tm-feed-ctl" aria-haspopup="dialog">
        Filters{n > 0 ? <span className="tm-feed-ctl-badge">{n}</span> : null} <span aria-hidden>▾</span>
      </button>
      {savedCount > 0 ? (
        <button type="button" onClick={onOpenSaved} className="tm-feed-ctl tm-feed-saved" style={{ marginLeft: "auto" }}>
          ★ Saved {savedCount} <span aria-hidden>→</span>
        </button>
      ) : null}
    </div>
  )
}

/** Segmented two-way rank toggle. Both states visible (no mystery single button).
 *  "Best fit" is omitted entirely when the user can't be fit-ranked. */
function SortToggle({
  sort, onSort, canFit,
}: { sort: JobFeedSort; onSort: (s: JobFeedSort) => void; canFit: boolean }) {
  const options = canFit ? SORT_TOGGLE : SORT_TOGGLE.filter(o => o.key === "fresh")
  if (options.length < 2) return null  // nothing to toggle → no control
  return (
    <div className="tm-feed-segmented" role="group" aria-label="Rank jobs by">
      {options.map(o => (
        <button
          key={o.key}
          type="button"
          aria-pressed={sort === o.key}
          onClick={() => onSort(o.key)}
          className={`tm-feed-seg ${sort === o.key ? "is-on" : ""}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── removable hard-filter chips (live in the summary line) ────────────────────

export function FilterChips({ filters, onChange }: { filters: FeedFilters; onChange: (f: FeedFilters) => void }) {
  // Role lives in <RoleSwitcher> (the always-visible target-role row); this only
  // carries the remaining removable hard filters.
  const chips: { key: string; label: string; clear: () => void }[] = []
  if (filters.minSkillMatches > 0) chips.push({ key: "skill", label: `≥ ${filters.minSkillMatches} skills`, clear: () => onChange({ ...filters, minSkillMatches: 0 }) })
  if (filters.followingOnly) chips.push({ key: "follow", label: "Following", clear: () => onChange({ ...filters, followingOnly: false }) })
  if (chips.length === 0) return null
  return (
    <>
      {chips.map(c => (
        <button key={c.key} type="button" onClick={c.clear} className="tm-feed-activechip" aria-label={`Remove filter: ${c.label}`}>
          {c.label} <span aria-hidden>✕</span>
        </button>
      ))}
    </>
  )
}

/**
 * Target-role switcher (summary line). Every role the user saved in Settings
 * renders as a chip: the active one is accent-filled with a clear ✕; the rest
 * are one tap away from loading that role's feed. Hidden when no roles are set.
 */
export function RoleSwitcher({
  targetRoles, chipCountMap, selected, onSelect,
}: {
  targetRoles: string[]
  chipCountMap: Record<string, number>
  selected: string | null
  onSelect: (role: string | null) => void
}) {
  if (targetRoles.length === 0) return null
  return (
    <>
      {targetRoles.map(role => {
        const active = selected === role
        const count = chipCountMap[role]
        const suffix = count != null ? ` · ${count}` : ""
        return (
          <button
            key={role}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(active ? null : role)}
            className={active ? "tm-feed-activechip" : "tm-feed-rolechip"}
            aria-label={active ? `Showing ${role} — tap to show all roles` : `Show ${role} roles`}
          >
            {role}{suffix}{active ? <span aria-hidden>✕</span> : null}
          </button>
        )
      })}
    </>
  )
}

// ── the sheet (3 sections: Role · Skill match · Companies) ────────────────────

export function FiltersSheet({
  filters, onChange, onClose, targetRoles, chipCountMap, hasCv,
}: {
  filters: FeedFilters
  onChange: (f: FeedFilters) => void
  onClose: () => void
  targetRoles: string[]
  chipCountMap: Record<string, number>
  hasCv: boolean
}) {
  const [mounted, setMounted] = useState(false)
  const [draft, setDraft] = useState<FeedFilters>(filters)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])
  if (!mounted) return null

  const apply = () => { onChange(draft); onClose() }
  const reset = () => setDraft({ ...draft, roleDomain: null, minSkillMatches: 0, followingOnly: false })

  return createPortal(
    <>
      <div onClick={onClose} className="tm-feed-scrim" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 70, animation: "tmScrimIn 200ms ease both" }} />
      <aside className="tm-filters-sheet" role="dialog" aria-label="Filter jobs">
        <header className="tm-filters-head">
          <h2>Filters</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="tm-filters-x">×</button>
        </header>
        <div className="tm-filters-body">
          <Section title="Role">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {targetRoles.map(role => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setDraft({ ...draft, roleDomain: draft.roleDomain === role ? null : role })}
                  className={`tm-sheet-chip ${draft.roleDomain === role ? "is-on" : ""}`}
                >
                  {role}{chipCountMap[role] != null ? ` · ${chipCountMap[role]}` : ""}
                </button>
              ))}
              {targetRoles.length === 0 ? <span className="tm-sheet-empty">Set target roles in settings to filter by role.</span> : null}
            </div>
          </Section>

          <Section title="Skill match" locked={!hasCv} lockNote="Upload your CV to filter by skill match">
            <Stepper value={draft.minSkillMatches} onChange={v => setDraft({ ...draft, minSkillMatches: v })} disabled={!hasCv} suffix="skills" />
          </Section>

          <Section title="Companies">
            <Toggle checked={draft.followingOnly} onChange={v => setDraft({ ...draft, followingOnly: v })} label="Only companies I follow" />
          </Section>
        </div>
        <footer className="tm-filters-foot">
          <button type="button" onClick={reset} className="tm-filters-reset">Reset</button>
          <button type="button" onClick={apply} className="tm-filters-apply">Show jobs</button>
        </footer>
      </aside>
    </>,
    document.body,
  )
}

function Section({ title, locked, lockNote, children }: { title: string; locked?: boolean; lockNote?: string; children: React.ReactNode }) {
  return (
    <section className="tm-filters-section" style={{ opacity: locked ? 0.55 : 1 }}>
      <div className="tm-filters-section-title">{title}{locked ? <span className="tm-filters-lock"> · {lockNote}</span> : null}</div>
      {children}
    </section>
  )
}

function Stepper({ value, onChange, disabled, suffix }: { value: number; onChange: (v: number) => void; disabled?: boolean; suffix: string }) {
  return (
    <div className="tm-stepper" aria-disabled={disabled}>
      <button type="button" disabled={disabled || value <= 0} onClick={() => onChange(Math.max(0, value - 1))} aria-label="Fewer">–</button>
      <span>{value === 0 ? "Any" : `≥ ${value} ${suffix}`}</span>
      <button type="button" disabled={disabled || value >= 10} onClick={() => onChange(Math.min(10, value + 1))} aria-label="More">+</button>
    </div>
  )
}

function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={`tm-toggle ${checked ? "is-on" : ""}`}>
      <span className="tm-toggle-track"><span className="tm-toggle-knob" /></span>
      <span>{label}</span>
    </button>
  )
}
