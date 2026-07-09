"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { useSignupGate } from "@/lib/hooks/use-signup-gate"
import { RESULTS_SORT, RESULTS_SORT_OPTIONS, type ResultsSortKey } from "@/lib/hooks/use-results-sort"
import { formatCount } from "@/lib/format"
import { CompanyHiringRow, CompanyRow, Empty, GroupRow, JobRow, type JobRowFit } from "./intel-rows"
import { IntelRowSkeletonList } from "./intel-row-skeleton"
import { fmtBatch } from "./intel-data"

export type ResultsTab = "companies" | "industries" | "cities"

// Render cap — the cities tab can carry 1500+ groups; rendering every row (each
// an SVG sparkline) freezes the page. Tab count shows the true total; list shows
// the top-N by job count. Users narrow the long tail via search / quick filters.
const GROUP_RENDER_CAP = 50

export interface ResultCompany {
  id: string
  name: string
  industry: string
  country: string
  open: number
  velocity: number
  sparks: number[]
  ageSec: number
  lastSeenIso: string | null
}

export interface ResultGroup {
  name: string
  count: number
  kind: "industry" | "city"
}

export interface GroupCompanyLite {
  company_name: string
  open_count: number
  location_country?: string | null
  last_seen_at?: string | null
}

export interface ResultJob {
  id: string
  title: string
  skills: string[]
  city: string
  country: string
  mode: string
  comp: string | null
  ageMin: number | null
}

export interface GlobalHitLite {
  job_id: string
  job_title: string
  company_name: string | null
  city: string | null
  mode: string
}

interface ResultsProps {
  tab: ResultsTab
  onTab: (t: ResultsTab) => void
  counts: { companies: number; industries: number; cities: number }
  companies: ResultCompany[]
  industries: ResultGroup[]
  cities: ResultGroup[]
  activeCo: string | null
  onActiveCo: (id: string) => void
  activeGroup: string | null
  onActiveGroup: (name: string) => void
  groupCompanies: GroupCompanyLite[]
  isGroupCompaniesLoading: boolean
  onCompanyJump: (company: string) => void
  jobsForActive: ResultJob[]
  jobsForActiveTotal: number
  activeCompanyName: string | null
  isAnalyticsLoading: boolean
  isFiltering: boolean
  isOpenRolesLoading: boolean
  globalSearch: {
    isActive: boolean
    isLoading: boolean
    hits: GlobalHitLite[]
  }
  sort: ResultsSortKey
  onSortChange: (k: ResultsSortKey) => void
  latestBatchIso: string | null
  /** Logged-in viewer — unlocks real fit, drops the signup CTA. */
  authed: boolean
  /** Authed + a CV uploaded — gates whether fit can be computed at all. */
  hasCv: boolean
  /** job_id → fit, lazily fetched for the active company's open roles. */
  fits: Map<string, JobRowFit>
  onCheckFit: (job: ResultJob, companyName: string | null) => void
  /** Unified capture (the ★ Save pill on each role row). */
  savedJobIds: Set<string>
  onSaveJob: (jobId: string) => void
  onSignup: () => void
  onTailor: (jobId: string) => void
}

export function IntelResults(props: ResultsProps) {
  return (
    <>
      <Tabs tab={props.tab} onTab={props.onTab} counts={props.counts}
        sort={props.sort} onSortChange={props.onSortChange} />
      <Split {...props} />
    </>
  )
}

function Tabs({
  tab, onTab, counts, sort, onSortChange,
}: {
  tab: ResultsTab
  onTab: (t: ResultsTab) => void
  counts: ResultsProps["counts"]
  sort: ResultsSortKey
  onSortChange: (k: ResultsSortKey) => void
}) {
  const items: { id: ResultsTab; label: string; n: number }[] = [
    { id: "companies", label: "Companies", n: counts.companies },
    { id: "industries", label: "Industries", n: counts.industries },
    { id: "cities", label: "Cities", n: counts.cities },
  ]
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [menuOpen])

  return (
    <div className="tm-intel-tabs">
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          className={"tm-intel-tab" + (tab === t.id ? " is-active" : "")}
          onClick={() => onTab(t.id)}
        >
          {t.label}
          <span className="tm-intel-tab-badge">{formatCount(t.n)}</span>
        </button>
      ))}
      <div className="tm-intel-spacer" />
      <span className="tm-intel-sort-lbl">Sort by</span>
      <div className="tm-intel-sort-pill-wrap" ref={wrapRef}>
        <button
          type="button"
          className="tm-intel-sort-pill"
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
        >
          {RESULTS_SORT[sort].label}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
            <path d="M2 4l3 3 3-3z" />
          </svg>
        </button>
        {menuOpen ? (
          <div className="tm-intel-sort-menu" role="listbox">
            {RESULTS_SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                role="option"
                aria-selected={sort === opt.key}
                className={"tm-intel-sort-menu-item" + (sort === opt.key ? " is-active" : "")}
                onClick={() => { onSortChange(opt.key); setMenuOpen(false) }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Split(props: ResultsProps) {
  const { tab, companies, industries, cities, activeCo, onActiveCo,
    activeGroup, onActiveGroup, groupCompanies, isGroupCompaniesLoading, onCompanyJump,
    jobsForActive, jobsForActiveTotal, activeCompanyName,
    isAnalyticsLoading, isFiltering, isOpenRolesLoading, globalSearch } = props
  const showLeftSkeleton = (isAnalyticsLoading || isFiltering) && !companies.length
  // Industries/Cities tabs drill into "top companies hiring here" (Q1=B).
  const groupMode = !globalSearch.isActive && tab !== "companies"
  return (
    <div className="tm-intel-split">
      <div className="tm-intel-panel">
        <div className="tm-intel-panel-head">
          <span className="tm-intel-panel-e">
            {globalSearch.isActive
              ? <>Companies matching <b>“{props.globalSearch.hits.length}”</b></>
              : tab === "companies" ? <>Top companies <b>· {companies.length}</b></>
              : tab === "industries" ? <>Industries <b>· {industries.length}</b></>
              : <>Cities <b>· {cities.length}</b></>}
          </span>
          <div className="tm-intel-spacer" />
          <span className="tm-intel-panel-meta">
            {isFiltering ? (
              <><span className="tm-intel-panel-meta-spin" /> filtering…</>
            ) : (
              <>
                <span className="tm-intel-panel-meta-ok">●</span> synced ·{" "}
                {props.latestBatchIso ? `batch ${fmtBatch(props.latestBatchIso)}` : "live mirror"}
              </>
            )}
          </span>
        </div>

        {showLeftSkeleton ? (
          <IntelRowSkeletonList count={8} variant="company" />
        ) : tab === "companies" ? (
          companies.length ? (
            companies.slice(0, 12).map((co) => (
              <CompanyRow
                key={co.id}
                co={co}
                isActive={co.id === activeCo}
                onClick={() => onActiveCo(co.id)}
              />
            ))
          ) : <Empty />
        ) : tab === "industries" ? (
          industries.length
            ? industries.slice(0, GROUP_RENDER_CAP).map((g) => (
                <GroupRow key={g.name} g={g} isActive={g.name === activeGroup}
                  onClick={() => onActiveGroup(g.name)} />
              ))
            : <Empty />
        ) : (
          cities.length
            ? cities.slice(0, GROUP_RENDER_CAP).map((g) => (
                <GroupRow key={g.name} g={g} isActive={g.name === activeGroup}
                  onClick={() => onActiveGroup(g.name)} />
              ))
            : <Empty />
        )}
      </div>

      <div className="tm-intel-panel">
        <div className="tm-intel-panel-head">
          <span className="tm-intel-panel-e">
            {globalSearch.isActive
              ? <>Search hits <b>· {globalSearch.hits.length}</b></>
              : groupMode
                ? (activeGroup ? <>Companies hiring · <b>{activeGroup}</b></> : <>Companies hiring</>)
              : activeCompanyName
                ? <>Open roles · <b>{activeCompanyName}</b></>
                : <>Open roles</>}
          </span>
          <div className="tm-intel-spacer" />
          <span className="tm-intel-panel-meta">
            {globalSearch.isActive
              ? (globalSearch.isLoading ? "searching…" : `${globalSearch.hits.length} hits`)
              : groupMode
                ? (isGroupCompaniesLoading ? "loading…" : `${groupCompanies.length} hiring`)
              : `${jobsForActive.length} of ${jobsForActiveTotal}`}
          </span>
        </div>

        {groupMode ? (
          isGroupCompaniesLoading && !groupCompanies.length
            ? <IntelRowSkeletonList count={6} variant="company" />
            : groupCompanies.length
              ? groupCompanies.map((co) => (
                  <CompanyHiringRow
                    key={co.company_name}
                    co={co}
                    onClick={() => onCompanyJump(co.company_name)}
                  />
                ))
              : <Empty />
        ) : globalSearch.isActive ? (
          globalSearch.isLoading && !globalSearch.hits.length
            ? <IntelRowSkeletonList count={6} variant="job" />
            : globalSearch.hits.length
              ? globalSearch.hits.map((h) => (
                  <div className="tm-intel-global-hit-row" key={h.job_id}>
                    <div>
                      <div className="tm-intel-global-hit-title">{h.job_title}</div>
                      <div className="tm-intel-global-hit-co">
                        {h.company_name ?? "—"}
                      </div>
                    </div>
                    <div className="tm-intel-global-hit-meta">
                      {[h.city, h.mode].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                ))
              : <Empty />
        ) : isOpenRolesLoading && !jobsForActive.length ? (
          <IntelRowSkeletonList count={4} variant="job" />
        ) : jobsForActive.length
          ? jobsForActive.map((j) => (
              <JobRow
                key={j.id}
                job={j}
                authed={props.authed}
                hasCv={props.hasCv}
                fit={props.fits.get(j.id) ?? null}
                onCheckFit={() => props.onCheckFit(j, props.activeCompanyName)}
                saved={props.savedJobIds.has(j.id)}
                onSave={() => props.onSaveJob(j.id)}
                onSignup={props.onSignup}
                onTailor={() => props.onTailor(j.id)}
              />
            ))
          : <Empty />}
        {props.authed ? null : <LockedCta />}
      </div>
    </div>
  )
}

function LockedCta() {
  const signup = useSignupGate()
  return (
    <div className="tm-intel-locked-cta">
      <div className="tm-intel-locked-body">
        <div className="tm-intel-locked-t">See your fit against every role.</div>
        <div className="tm-intel-locked-s">Create your profile to match, track, and export.</div>
      </div>
      <Link
        href="/signup?next=/cv?upload=1"
        className="tm-intel-locked-btn"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
          e.preventDefault()
          signup.open({ surface: "manual", next: "/cv?upload=1", source: "intel_locked_cta" })
        }}
      >
        Create your profile →
      </Link>
    </div>
  )
}
