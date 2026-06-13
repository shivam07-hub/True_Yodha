"use client"

import { useSignupGate } from "@/lib/hooks/use-signup-gate"
import {
  COUNTRY_NAMES, fmtAgeMin, fmtBatch, hexToRgba, initialsFor, logoColorFor,
} from "./intel-data"
import type { ResultCompany, ResultGroup, ResultJob } from "./intel-results"

export function Spark({
  data, w = 64, h = 22, color = "var(--tm-accent)",
}: { data: number[]; w?: number; h?: number; color?: string }) {
  if (!data.length) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = Math.max(max - min, 1)
  const step = w / Math.max(data.length - 1, 1)
  const pts = data.map((v, i) => {
    const x = i * step
    const y = h - ((v - min) / range) * (h - 4) - 2
    return [x, y] as const
  })
  const d = pts
    .map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1))
    .join(" ")
  const fill = d + ` L ${w} ${h} L 0 ${h} Z`
  const last = pts[pts.length - 1]
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={fill} fill={color} fillOpacity="0.08" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2" fill={color} />
    </svg>
  )
}

function Logo({ name }: { name: string }) {
  const color = logoColorFor(name)
  return (
    <div
      className="tm-intel-co-logo"
      style={{
        background: hexToRgba(color, 0.15),
        color: color,
        borderColor: hexToRgba(color, 0.35),
      }}
    >
      {initialsFor(name)}
    </div>
  )
}

export function CompanyRow({
  co, isActive, onClick,
}: { co: ResultCompany; isActive: boolean; onClick: () => void }) {
  const velUp = co.velocity >= 0
  return (
    <button
      type="button"
      className={"tm-intel-co-row" + (isActive ? " is-active" : "")}
      onClick={onClick}
      aria-pressed={isActive}
    >
      <Logo name={co.name} />
      <div className="tm-intel-co-body">
        <div className="tm-intel-co-name">
          <span>{co.name}</span>
          {co.industry ? <span className="tm-intel-co-industry">{co.industry}</span> : null}
        </div>
        <div className="tm-intel-co-meta">
          <span className="tm-intel-co-updated">
            {co.lastSeenIso ? `scraped ${fmtBatch(co.lastSeenIso)}` : "scrape date n/a"}
          </span>
          <span className="tm-intel-co-sep">·</span>
          <span>{COUNTRY_NAMES[co.country] || co.country || "—"}</span>
        </div>
      </div>
      <div className="tm-intel-co-spark">
        <Spark data={co.sparks} />
        <div className={"tm-intel-co-velocity " + (velUp ? "is-up" : "is-down")}>
          {velUp ? "↑" : "↓"} {Math.abs(co.velocity)}/wk
        </div>
      </div>
      <div className="tm-intel-co-roles">
        {co.open}
        <span className="tm-intel-co-roles-lab">open</span>
      </div>
    </button>
  )
}

export function GroupRow({
  g, isActive, onClick,
}: { g: ResultGroup; isActive: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={"tm-intel-co-row" + (isActive ? " is-active" : "")}
      onClick={onClick}
      aria-pressed={isActive}
    >
      <div className="tm-intel-co-logo tm-intel-co-logo-accent">
        {g.kind === "industry" ? "§" : "◎"}
      </div>
      <div className="tm-intel-co-body">
        <div className="tm-intel-co-name"><span>{g.name}</span></div>
        <div className="tm-intel-co-meta">
          <span>{g.kind === "industry" ? "category" : "metro"}</span>
        </div>
      </div>
      <div className="tm-intel-co-roles">
        {g.count.toLocaleString()}<span className="tm-intel-co-roles-lab">jobs</span>
      </div>
    </button>
  )
}

export function CompanyHiringRow({
  co, onClick,
}: {
  co: { company_name: string; open_count: number; location_country?: string | null; last_seen_at?: string | null }
  onClick: () => void
}) {
  return (
    <button type="button" className="tm-intel-co-row" onClick={onClick}>
      <Logo name={co.company_name} />
      <div className="tm-intel-co-body">
        <div className="tm-intel-co-name"><span>{co.company_name}</span></div>
        <div className="tm-intel-co-meta">
          <span className="tm-intel-co-updated">
            {co.last_seen_at ? `scraped ${fmtBatch(co.last_seen_at)}` : "scrape date n/a"}
          </span>
          <span className="tm-intel-co-sep">·</span>
          <span>{COUNTRY_NAMES[co.location_country || ""] || co.location_country || "—"}</span>
        </div>
      </div>
      <div className="tm-intel-co-roles">
        {co.open_count}<span className="tm-intel-co-roles-lab">open</span>
      </div>
      <span className="tm-intel-co-go" aria-hidden="true">→</span>
    </button>
  )
}

export function JobRow({ job }: { job: ResultJob }) {
  const fresh = job.ageMin < 60 * 24
  const signup = useSignupGate()
  return (
    <div className="tm-intel-job-row">
      <div className="tm-intel-job-head">
        <div className="tm-intel-job-title">{job.title}</div>
        <button
          type="button"
          className="tm-intel-fit-locked"
          title="Sign in to see your fit % against this role"
          onClick={() =>
            signup.open({ surface: "manual", mode: "login", source: "intel_fit_lock" })
          }
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          fit · sign in
        </button>
      </div>
      <div className="tm-intel-job-sub">
        <span>{job.city}</span>
        <span className="tm-intel-co-sep">·</span>
        <span className="tm-intel-job-mode">{job.mode}</span>
        {job.comp ? (
          <>
            <span className="tm-intel-co-sep">·</span>
            <span className="tm-intel-job-salary">{job.comp}</span>
          </>
        ) : null}
        <span className="tm-intel-co-sep">·</span>
        <span className={"tm-intel-job-age" + (fresh ? " is-fresh" : "")}>
          {fmtAgeMin(job.ageMin)}
        </span>
      </div>
      <div className="tm-intel-job-skills">
        {job.skills.map((s) => <span className="tm-intel-job-skill" key={s}>{s}</span>)}
      </div>
    </div>
  )
}

export function Empty() {
  return (
    <div className="tm-intel-empty">
      <svg className="tm-intel-empty-icon" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      No matches. Try removing a filter or another query.
    </div>
  )
}
