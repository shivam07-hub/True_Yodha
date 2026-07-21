"use client"

import type { JobFeedSort } from "@/lib/api"
import {
  type FeedFilters, SORT_TOGGLE, WORK_MODES, canRankByFit, activeFilterCount,
} from "./feed-types"

// The sheet itself lives in ./filters-sheet — one component shared by the
// desktop drawer and the mobile bottom sheet.
export { FiltersSheet } from "./filters-sheet"

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
  if (filters.locationMode) {
    const label = WORK_MODES.find(([m]) => m === filters.locationMode)?.[1] ?? filters.locationMode
    chips.push({ key: "mode", label, clear: () => onChange({ ...filters, locationMode: null }) })
  }
  if (filters.minSkillMatches > 0) chips.push({ key: "skill", label: `≥ ${filters.minSkillMatches} skills`, clear: () => onChange({ ...filters, minSkillMatches: 0 }) })
  if (filters.followingOnly) chips.push({ key: "follow", label: "Following", clear: () => onChange({ ...filters, followingOnly: false }) })
  if (filters.includeStretch) chips.push({ key: "stretch", label: "Next-level stretch", clear: () => onChange({ ...filters, includeStretch: false }) })
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
