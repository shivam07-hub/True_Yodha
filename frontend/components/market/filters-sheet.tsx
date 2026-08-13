"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import type { CareerBand } from "@/lib/api"
import type { FeedScope } from "@/lib/feed-scope"
import { TargetRolesChips } from "@/components/target-role/target-roles-chips"
import {
  type FeedFilters, WORK_MODES, activeFilterCount, resetFilters,
} from "./feed-types"
import "./market.css"

/**
 * THE filters sheet — one component, both surfaces.
 *
 * Desktop renders it as a right-hand drawer; at ≤600px the same markup becomes
 * a bottom sheet (`.tm-filters-sheet` media query in market.css). Mobile used to
 * ship its own two-filter fork that could not reach the server filters at all —
 * that fork is gone. If a filter belongs to the feed, it belongs here, and both
 * skins get it the same day.
 *
 * Sections: Location (read-only, settings-owned) · Work mode · Role ·
 * Career path · Skill match · Companies · Seniority · Listing quality.
 */

const CAREER_BANDS: ReadonlyArray<readonly [CareerBand, string]> = [
  ["engineering_data", "Engineering & Data"],
  ["business_product_operations", "Business, Product & Operations"],
  ["research_people_public_impact", "Research, People & Public Impact"],
  ["design_creative", "Design & Creative"],
] as const

export function FiltersSheet({
  filters, onChange, onClose, targetRoles, chipCountMap, hasCv, scope, onEditLocations,
  primaryCareerBand, exploredCareerBands, onExploredCareerBandsChange, applyLabel,
}: {
  filters: FeedFilters
  onChange: (f: FeedFilters) => void
  onClose: () => void
  targetRoles: string[]
  chipCountMap: Record<string, number>
  hasCv: boolean
  scope: FeedScope
  onEditLocations: () => void
  primaryCareerBand?: CareerBand | null
  exploredCareerBands?: CareerBand[]
  onExploredCareerBandsChange?: (bands: CareerBand[]) => void
  /** Optional confirm-button label. Left as "Show jobs" by default — never a
   *  count, because the loaded page is not the corpus. */
  applyLabel?: string
}) {
  const [mounted, setMounted] = useState(false)
  const [draft, setDraft] = useState<FeedFilters>(filters)
  const [draftCareerBands, setDraftCareerBands] = useState<CareerBand[]>(exploredCareerBands ?? [])
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { setDraftCareerBands(exploredCareerBands ?? []) }, [exploredCareerBands])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])
  if (!mounted) return null

  const apply = () => {
    onChange(draft)
    onExploredCareerBandsChange?.(draftCareerBands)
    onClose()
  }
  const reset = () => setDraft(resetFilters(draft))
  const dirty = activeFilterCount(draft) > 0

  return createPortal(
    <>
      <div onClick={onClose} className="tm-feed-scrim" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 70, animation: "tmScrimIn 200ms ease both" }} />
      <aside className="tm-filters-sheet" role="dialog" aria-label="Filter jobs">
        <header className="tm-filters-head">
          <h2>Filters</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="tm-filters-x">×</button>
        </header>
        <div className="tm-filters-body">
          {/* Location is settings-owned (the feed scopes server-side to saved
              target locations, never per-session). Shown here read-only so this
              door surfaces the whole narrowing model — with a bridge to where
              it's actually editable. Mirrors the summary row's 📍-first order. */}
          <Section title="Location">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {scope.isEmpty
                ? <span className="tm-sheet-empty">All locations — set targets in settings to scope your feed.</span>
                : scope.cities.map(loc => (
                    <span key={loc} className="tm-sheet-chip is-static">📍 {loc}</span>
                  ))}
            </div>
            <button type="button" onClick={onEditLocations} className="tm-filters-editlink">
              Edit in settings →
            </button>
          </Section>

          <Section title="Work mode">
            <div className="tm-feed-segmented" role="group" aria-label="Work mode">
              {WORK_MODES.map(([mode, label]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={draft.locationMode === mode}
                  onClick={() => setDraft({ ...draft, locationMode: mode })}
                  className={`tm-feed-seg ${draft.locationMode === mode ? "is-on" : ""}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Role">
            <div style={{ marginBottom: targetRoles.length ? 10 : 0 }}>
              <TargetRolesChips editable showReadiness />
            </div>
            {targetRoles.length > 0 && (
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
              </div>
            )}
          </Section>

          <Section title="Career path">
            <div className="tm-sheet-empty" style={{ marginBottom: 8 }}>
              {primaryCareerBand
                ? `Your primary path: ${CAREER_BANDS.find(([key]) => key === primaryCareerBand)?.[1] ?? primaryCareerBand}`
                : "Your primary path is inferred from your CV and target role."}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {CAREER_BANDS.filter(([key]) => key !== primaryCareerBand).map(([key, label]) => (
                <Toggle
                  key={key}
                  checked={draftCareerBands.includes(key)}
                  onChange={(enabled) => setDraftCareerBands(current => enabled
                    ? Array.from(new Set([...current, key]))
                    : current.filter((band) => band !== key))}
                  label={`Also explore ${label}`}
                />
              ))}
            </div>
          </Section>

          <Section title="Skill match" locked={!hasCv} lockNote="Upload your CV to filter by skill match">
            <Stepper value={draft.minSkillMatches} onChange={v => setDraft({ ...draft, minSkillMatches: v })} disabled={!hasCv} suffix="skills" />
          </Section>

          <Section title="Companies">
            <Toggle checked={draft.followingOnly} onChange={v => setDraft({ ...draft, followingOnly: v })} label="Only companies I follow" />
          </Section>

          <Section title="Seniority">
            <Toggle checked={draft.includeStretch} onChange={v => setDraft({ ...draft, includeStretch: v })} label="Include next-level stretch roles" />
          </Section>

          {/* View-scope: legitimacy comes from the per-job brain eval joined onto
              each fetched page, so this hides loaded cards rather than narrowing
              the query. The note says so — the count must never imply otherwise. */}
          <Section title="Listing quality">
            <Toggle checked={draft.hideLowConfidence} onChange={v => setDraft({ ...draft, hideLowConfidence: v })} label={"Hide “check details” roles"} />
            <span className="tm-sheet-empty">Hides loaded cards flagged low-confidence or stale.</span>
          </Section>
        </div>
        <footer className="tm-filters-foot">
          <button type="button" onClick={reset} disabled={!dirty} className="tm-filters-reset">Reset</button>
          <button type="button" onClick={apply} className="tm-filters-apply">{applyLabel ?? "Show jobs"}</button>
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
