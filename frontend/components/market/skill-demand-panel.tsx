"use client"

import { useEffect, useMemo, useState } from "react"
import type { SkillDemandItem, SkillDemandWindow } from "@/lib/api"
import { useSkillDemand, useSkillDemandCities } from "@/lib/hooks/use-skill-demand"
import { Skeleton } from "@/components/ui/skeleton"

/** Employer ticks rendered in the demand bar. Above this the field reads as
 *  "many" anyway, and the count beside it carries the exact number. */
const MAX_TICKS = 14

/** Rows shown in the rail. Six fills the widget without crowding out the
 *  hiring + verify widgets below it in a 320px column. */
const ROW_LIMIT = 6

interface Props {
  /** The viewer's own city, preselected when it is one of the covered cities. */
  homeCity?: string | null
  /** Filters the feed to this skill — the row's whole reason to be tappable. */
  onFilterSkill: (skill: string) => void
  /** Opens when the preceding item in the automatic rail cascade settles. */
  enabled?: boolean
  /** Reports the initial panel read settling so the next rail item can start. */
  onSettled?: () => void
}

export function SkillDemandPanel({ homeCity, onFilterSkill, enabled = true, onSettled }: Props) {
  const [range, setRange] = useState<SkillDemandWindow>("30d")
  const [city, setCity] = useState<string | null>(null)

  const { cities: covered, loading: citiesLoading, settled: citiesSettled } = useSkillDemandCities(enabled)

  // Preselect the viewer's city when it is covered, else the largest market —
  // never an empty picker, never a city we cannot say anything true about.
  const active = useMemo(() => {
    if (city) return city
    const home = covered.find((c) => c.city.toLowerCase() === (homeCity ?? "").trim().toLowerCase())
    return home?.city ?? covered[0]?.city ?? null
  }, [city, covered, homeCity])

  const { skills, computedAt, loading: demandLoading, settled: demandSettled } = useSkillDemand(active, range, enabled, ROW_LIMIT)

  // Keep the previous city's rows on screen while the next city loads: the
  // panel changing height under the cursor is worse than one stale beat.
  const [rows, setRows] = useState<SkillDemandItem[]>([])
  useEffect(() => {
    if (!demandLoading) setRows(skills)
  }, [skills, demandLoading])

  const loading = citiesLoading || (demandLoading && rows.length === 0)
  const initialSettled = enabled && citiesSettled && (!active || demandSettled)

  useEffect(() => {
    if (initialSettled) onSettled?.()
  }, [initialSettled, onSettled])

  if (!enabled) return <SkillDemandLoading />
  if (loading) return <SkillDemandLoading />
  if (!active) return null

  return (
    <section className="mi-widget mi-hero sd" aria-label="Skill demand">
      <div className="mi-widget-head">
        <h4 className="mi-h4">Skill demand</h4>
        <div className="mi-seg" role="group" aria-label="Time window">
          {(["30d", "all"] as const).map((w) => (
            <button
              key={w}
              type="button"
              className="mi-seg-btn"
              aria-pressed={range === w}
              onClick={() => setRange(w)}
            >
              {w === "30d" ? "30d" : "All time"}
            </button>
          ))}
        </div>
      </div>

      <label className="sd-city">
        <span className="sd-city-label">in</span>
        <select
          value={active}
          onChange={(e) => setCity(e.target.value)}
          aria-label="City"
        >
          {covered.map((c) => (
            <option key={c.city} value={c.city}>
              {c.city}
            </option>
          ))}
        </select>
        <svg className="sd-caret" width="9" height="6" viewBox="0 0 9 6" aria-hidden="true">
          <path d="M1 1l3.5 3.5L8 1" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </label>

      {rows.length === 0 ? (
        <p className="sd-empty">
          No skill in {active} has enough employers hiring to rank yet.
        </p>
      ) : (
        <ol className="sd-list">
          {rows.map((row) => (
            <li key={row.skill}>
              <button type="button" className="sd-row" onClick={() => onFilterSkill(row.skill)}>
                <span className="sd-row-top">
                  <span className="sd-skill">{row.skill}</span>
                  <span className="sd-roles">{row.roles}</span>
                </span>
                <span className="sd-row-btm">
                  <SpreadBar companies={row.companies} />
                  <span className="sd-meta">
                    {row.companies} employer{row.companies === 1 ? "" : "s"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {computedAt ? <p className="sd-foot">Counted {relativeTime(computedAt)}</p> : null}
    </section>
  )
}

/**
 * The panel's signature mark: one tick per employer hiring for this skill.
 *
 * Breadth is the fact the old rail hid — it ranked "Agentic AI" at 321 roles in
 * Gurugram when 250 of them were one employer's template. A wide field reads as
 * a market; three lonely ticks read as one company hiring, before any number is
 * read.
 *
 * Deliberately does NOT also encode role count by width. An earlier version did,
 * and it inverted: a 4-employer skill drew fatter segments than a 10-employer
 * one, so the mark contradicted the very thing it exists to show. Roles are
 * already stated in accent type beside it and the list is rank-ordered, so width
 * carried nothing that wasn't said twice already.
 */
function SpreadBar({ companies }: { companies: number }) {
  const ticks = Math.max(1, Math.min(companies, MAX_TICKS))
  return (
    <span className="sd-bar" aria-hidden="true">
      {Array.from({ length: ticks }, (_, i) => (
        <span key={i} className="sd-tick" />
      ))}
      {companies > MAX_TICKS ? <span className="sd-tick sd-tick-more" /> : null}
    </span>
  )
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return "recently"
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 2) return "just now"
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return days === 1 ? "yesterday" : `${days} days ago`
}

/** Real-shape skeleton: same rows, same bar, so content lands in place. */
function SkillDemandLoading() {
  return (
    <div className="mi-widget mi-hero sd" aria-hidden="true">
      <div className="mi-widget-head">
        <h4 className="mi-h4">Skill demand</h4>
      </div>
      <ol className="sd-list">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i}>
            <div className="sd-row">
              <span className="sd-row-top">
                <Skeleton style={{ flex: 1, height: 14, borderRadius: 4, maxWidth: `${74 - i * 8}%` }} />
                <Skeleton style={{ width: 26, height: 13, borderRadius: 4 }} />
              </span>
              <Skeleton style={{ width: `${88 - i * 14}%`, height: 6, borderRadius: 3, marginTop: 8 }} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
