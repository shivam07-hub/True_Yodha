"use client"

import { type FeedFilters, WORK_MODES, activeFilterCount } from "./feed-types"

// The sheet itself lives in ./filters-sheet — one component shared by the
// desktop drawer and the mobile bottom sheet.
export { FiltersSheet } from "./filters-sheet"

// ── the control row: rank toggle · Filters button · Saved ─────────────────────

// The rank toggle is gone with the sort it toggled: a list of forty jobs chosen
// for one person has one order. "Best fit ⇄ Newest" was reordering a 500-row
// sample of a single shared date, and the composite behind "Best fit" is deleted.
export function FeedControls({
  filters, savedCount, onOpenSaved, onOpenFilters,
}: {
  filters: FeedFilters
  savedCount: number
  onOpenSaved: () => void
  onOpenFilters: () => void
}) {
  const n = activeFilterCount(filters)
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
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

// ── removable filter chips (live in the summary line) ─────────────────────────

export function FilterChips({ filters, onChange }: { filters: FeedFilters; onChange: (f: FeedFilters) => void }) {
  // Role lives in <RoleSwitcher> (the always-visible target-role row); this only
  // carries the remaining removable filters.
  const chips: { key: string; label: string; clear: () => void }[] = []
  if (filters.locationMode) {
    const label = WORK_MODES.find(([m]) => m === filters.locationMode)?.[1] ?? filters.locationMode
    chips.push({ key: "mode", label, clear: () => onChange({ ...filters, locationMode: null }) })
  }
  if (filters.hideLowConfidence) chips.push({ key: "quality", label: "Verified-looking only", clear: () => onChange({ ...filters, hideLowConfidence: false }) })
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
            <span className="tm-feed-chip-label" title={role}>{role}</span>{suffix}{active ? <span aria-hidden>✕</span> : null}
          </button>
        )
      })}
    </>
  )
}
