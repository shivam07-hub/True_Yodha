"use client"

import Link from "next/link"
import { useSignupGate } from "@/lib/hooks/use-signup-gate"
import { CompanyRow, Empty, GroupRow, JobRow } from "./intel-rows"

export type ResultsTab = "companies" | "industries" | "cities"

export interface ResultCompany {
  id: string
  name: string
  industry: string
  country: string
  open: number
  velocity: number
  sparks: number[]
  ageSec: number
}

export interface ResultGroup {
  name: string
  count: number
  sparks: number[]
  kind: "industry" | "city"
}

export interface ResultJob {
  id: string
  title: string
  skills: string[]
  city: string
  country: string
  mode: string
  comp: string | null
  ageMin: number
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
  jobsForActive: ResultJob[]
  jobsForActiveTotal: number
  activeCompanyName: string | null
}

export function IntelResults(props: ResultsProps) {
  return (
    <>
      <Tabs tab={props.tab} onTab={props.onTab} counts={props.counts} />
      <Split {...props} />
    </>
  )
}

function Tabs({
  tab, onTab, counts,
}: { tab: ResultsTab; onTab: (t: ResultsTab) => void; counts: ResultsProps["counts"] }) {
  const items: { id: ResultsTab; label: string; n: number }[] = [
    { id: "companies", label: "Companies", n: counts.companies },
    { id: "industries", label: "Industries", n: counts.industries },
    { id: "cities", label: "Cities", n: counts.cities },
  ]
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
          <span className="tm-intel-tab-badge">{t.n.toLocaleString()}</span>
        </button>
      ))}
      <div className="tm-intel-spacer" />
      <span className="tm-intel-sort-lbl">Sort by</span>
      <button type="button" className="tm-intel-sort-pill">
        Hiring velocity
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
          <path d="M2 4l3 3 3-3z" />
        </svg>
      </button>
    </div>
  )
}

function Split(props: ResultsProps) {
  const { tab, companies, industries, cities, activeCo, onActiveCo,
    jobsForActive, jobsForActiveTotal, activeCompanyName } = props
  return (
    <div className="tm-intel-split">
      <div className="tm-intel-panel">
        <div className="tm-intel-panel-head">
          <span className="tm-intel-panel-e">
            {tab === "companies" && (<>Top companies <b>· {companies.length}</b></>)}
            {tab === "industries" && (<>Industries <b>· {industries.length}</b></>)}
            {tab === "cities" && (<>Cities <b>· {cities.length}</b></>)}
          </span>
          <div className="tm-intel-spacer" />
          <span className="tm-intel-panel-meta">
            <span className="tm-intel-panel-meta-ok">●</span> live · re-indexed every 60s
          </span>
        </div>

        {tab === "companies" && (
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
        )}

        {tab === "industries" && (
          industries.length
            ? industries.map((g) => <GroupRow key={g.name} g={g} />)
            : <Empty />
        )}

        {tab === "cities" && (
          cities.length
            ? cities.map((g) => <GroupRow key={g.name} g={g} />)
            : <Empty />
        )}
      </div>

      <div className="tm-intel-panel">
        <div className="tm-intel-panel-head">
          <span className="tm-intel-panel-e">
            {activeCompanyName ? <>Open roles · <b>{activeCompanyName}</b></> : <>Open roles</>}
          </span>
          <div className="tm-intel-spacer" />
          <span className="tm-intel-panel-meta">
            {jobsForActive.length} of {jobsForActiveTotal}
          </span>
        </div>
        {jobsForActive.length
          ? jobsForActive.map((j) => <JobRow key={j.id} job={j} />)
          : <Empty />}
        <LockedCta />
      </div>
    </div>
  )
}

function LockedCta() {
  const signup = useSignupGate()
  return (
    <div className="tm-intel-locked-cta">
      <div className="tm-intel-locked-body">
        <div className="tm-intel-locked-t">Sign up to see your fit against every role.</div>
        <div className="tm-intel-locked-s">Free. Yours to export. Always.</div>
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
        Sign up free →
      </Link>
    </div>
  )
}
