"use client"

import { fitBand } from "@/lib/job-fit-intent"
import {
  COUNTRY_NAMES, fmtBatch, hexToRgba, initialsFor, logoColorFor,
} from "./intel-data"
import { formatCount } from "@/lib/format"
import { CompanyLink } from "@/components/companies/company-link"
import { CapturePill } from "@/components/jobs/capture-pill"
import { FeedCard } from "@/components/jobs/feed-card"
import { feedDataFromIntelJob } from "@/lib/jobs/card-view"
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
    <div
      className={"tm-intel-co-row" + (isActive ? " is-active" : "")}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick() } }}
      aria-pressed={isActive}
    >
      <Logo name={co.name} />
      <div className="tm-intel-co-body">
        {/* Company name = crawlable link to /companies/{name} (locked
            CompanyLink principle) → SEO/AEO discovery + logged-out access to all
            of a company's jobs. The row's own click still selects the in-pane
            role preview. */}
        <div className="tm-intel-co-name">
          <CompanyLink company={co.name} />
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
    </div>
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
        {formatCount(g.count)}<span className="tm-intel-co-roles-lab">jobs</span>
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
    <div
      className="tm-intel-co-row"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick() } }}
    >
      <Logo name={co.company_name} />
      <div className="tm-intel-co-body">
        {/* Company name = the crawlable link to /companies/{name} (the locked
            CompanyLink principle). Restores SEO/AEO discovery of company pages
            and lets logged-out users open all of a company's jobs; the row's own
            click still opens the in-pane role preview. */}
        <div className="tm-intel-co-name"><CompanyLink company={co.company_name} /></div>
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
    </div>
  )
}

export interface JobRowFit {
  overlap_score: number
  matched_skills: string[]
  matched_count: number
  total_skills: number
}

function FitSlot({
  authed, hasCv, fit, onCheckFit,
}: { authed: boolean; hasCv: boolean; fit: JobRowFit | null; onCheckFit: () => void }) {
  // Logged out - the drawer asks for CV evidence before auth.
  if (!authed) {
    return (
      <button
        type="button"
        className="tm-intel-fit-locked"
        title="Check your fit against this role"
        onClick={onCheckFit}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        check fit
      </button>
    )
  }

  // Logged in but fit unknown — no CV, or this role carries no taxonomy skills.
  // The drawer owns the single upload/unknown state.
  if (!hasCv || !fit) {
    return (
      <button
        type="button"
        className="tm-intel-fit-muted"
        aria-label="Check fit for this role"
        onClick={onCheckFit}
      >
        —
      </button>
    )
  }

  const band = fitBand(fit.overlap_score)
  return (
    <button
      type="button"
      className={`tm-intel-fit-pill is-${band}`}
      title={`${fit.matched_count} of ${fit.total_skills} required skills matched`}
      onClick={onCheckFit}
    >
      {Math.round(fit.overlap_score)}%
      <span className="tm-intel-fit-skills">· {fit.matched_count}/{fit.total_skills} skills</span>
    </button>
  )
}

// The ONE job card (compact density) — identical anatomy to /market and
// /companies. The fit affordance stays Intel's own <FitSlot> (it carries the
// anon "check fit" states the market card has no concept of), passed as the card's
// fit override; everything else — role type, ✓/✗ chips, context, capture — is the
// shared FeedCard.
export function JobRow({
  job, authed = false, hasCv = false, fit = null, onCheckFit,
  saved = false, onSave, onSignup, onTailor,
}: {
  job: ResultJob
  authed?: boolean
  hasCv?: boolean
  fit?: JobRowFit | null
  onCheckFit: () => void
  /** Capture state (unified control) — Intel is a capture surface in the loop. */
  saved?: boolean
  onSave?: () => void
  onSignup?: () => void
  onTailor?: () => void
}) {
  return (
    <FeedCard
      variant="compact"
      data={feedDataFromIntelJob(job, fit ? { matched_skills: fit.matched_skills, total_skills: fit.total_skills } : null)}
      onOpen={onCheckFit}
      fit={<FitSlot authed={authed} hasCv={hasCv} fit={fit} onCheckFit={onCheckFit} />}
      actions={
        <CapturePill
          status={!authed ? "signed-out" : saved ? "saved" : "rest"}
          size="sm"
          label={job.title}
          onSave={onSave}
          onSignUp={onSignup}
          onTailor={onTailor}
        />
      }
    />
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
