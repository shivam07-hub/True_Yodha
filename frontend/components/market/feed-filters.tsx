"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import type { JobFeedSort } from "@/lib/api"
import {
  type FeedFilters, FIT_LENSES, FRESHNESS_PRESETS,
  activeFilterCount, freshnessLabel,
} from "./feed-types"

// ── the control row: Filters button · Sort · Saved-N pill · location ──────────

export function FeedControls({
  filters, onChange, targetRoles, chipCountMap, hasCv, hasTargetRoles,
  savedCount, onOpenSaved, locationPill,
}: {
  filters: FeedFilters
  onChange: (f: FeedFilters) => void
  targetRoles: string[]
  chipCountMap: Record<string, number>
  hasCv: boolean
  hasTargetRoles: boolean
  savedCount: number
  onOpenSaved: () => void
  locationPill: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const n = activeFilterCount(filters)

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <button type="button" onClick={() => setOpen(true)} className="tm-feed-ctl" aria-haspopup="dialog">
        Filters{n > 0 ? <span className="tm-feed-ctl-badge">{n}</span> : null} <span aria-hidden>▾</span>
      </button>
      <SortInline sort={filters.sort} onSort={s => onChange({ ...filters, sort: s })} hasCv={hasCv} hasTargetRoles={hasTargetRoles} />
      {locationPill}
      {savedCount > 0 ? (
        <button type="button" onClick={onOpenSaved} className="tm-feed-ctl tm-feed-saved" style={{ marginLeft: "auto" }}>
          ★ Saved {savedCount} <span aria-hidden>→</span>
        </button>
      ) : null}
      {open ? (
        <FiltersSheet
          filters={filters}
          onChange={onChange}
          onClose={() => setOpen(false)}
          targetRoles={targetRoles}
          chipCountMap={chipCountMap}
          hasCv={hasCv}
          hasTargetRoles={hasTargetRoles}
        />
      ) : null}
    </div>
  )
}

function SortInline({
  sort, onSort, hasCv, hasTargetRoles,
}: { sort: JobFeedSort; onSort: (s: JobFeedSort) => void; hasCv: boolean; hasTargetRoles: boolean }) {
  return (
    <div className="tm-feed-sortbar" role="group" aria-label="Sort jobs by">
      {FIT_LENSES.map(l => {
        const locked = (l.needsCv && !hasCv) || (l.needsRoles && !hasTargetRoles)
        const on = sort === l.key
        return (
          <button
            key={l.key}
            type="button"
            disabled={locked}
            onClick={() => onSort(l.key)}
            title={locked ? (l.needsCv ? "Upload your CV to rank by skill match" : "Set target roles to rank by role match") : undefined}
            className={`tm-feed-sort ${on ? "is-on" : ""}`}
          >
            {l.label}{locked ? " 🔒" : ""}
          </button>
        )
      })}
    </div>
  )
}

// ── active filter chips (removable) ──────────────────────────────────────────

export function ActiveFilterChips({ filters, onChange }: { filters: FeedFilters; onChange: (f: FeedFilters) => void }) {
  const chips: { key: string; label: string; clear: () => void }[] = []
  if (filters.roleDomain) chips.push({ key: "role", label: filters.roleDomain, clear: () => onChange({ ...filters, roleDomain: null }) })
  if (filters.minSkillMatches > 0) chips.push({ key: "skill", label: `≥ ${filters.minSkillMatches} skills`, clear: () => onChange({ ...filters, minSkillMatches: 0 }) })
  if (filters.targetRoleOnly) chips.push({ key: "trole", label: "Matches my role", clear: () => onChange({ ...filters, targetRoleOnly: false }) })
  if (filters.freshnessDays > 0) chips.push({ key: "fresh", label: freshnessLabel(filters.freshnessDays), clear: () => onChange({ ...filters, freshnessDays: 0 }) })
  if (filters.followingOnly) chips.push({ key: "follow", label: "Following only", clear: () => onChange({ ...filters, followingOnly: false }) })
  if (chips.length === 0) return null
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
      {chips.map(c => (
        <button key={c.key} type="button" onClick={c.clear} className="tm-feed-activechip">
          {c.label} <span aria-hidden>✕</span>
        </button>
      ))}
    </div>
  )
}

// ── the sheet ────────────────────────────────────────────────────────────────

function FiltersSheet({
  filters, onChange, onClose, targetRoles, chipCountMap, hasCv, hasTargetRoles,
}: {
  filters: FeedFilters
  onChange: (f: FeedFilters) => void
  onClose: () => void
  targetRoles: string[]
  chipCountMap: Record<string, number>
  hasCv: boolean
  hasTargetRoles: boolean
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
  const reset = () => setDraft({ ...draft, roleDomain: null, minSkillMatches: 0, targetRoleOnly: false, freshnessDays: 0, followingOnly: false })

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

          <Section title="Target role" locked={!hasTargetRoles} lockNote="Set target roles in settings">
            <Toggle checked={draft.targetRoleOnly} onChange={v => setDraft({ ...draft, targetRoleOnly: v })} disabled={!hasTargetRoles} label="Only jobs that match my target role" />
          </Section>

          <Section title="Freshness">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {FRESHNESS_PRESETS.map(p => (
                <button key={p.days} type="button" onClick={() => setDraft({ ...draft, freshnessDays: p.days })} className={`tm-sheet-chip ${draft.freshnessDays === p.days ? "is-on" : ""}`}>
                  {p.label}
                </button>
              ))}
            </div>
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
