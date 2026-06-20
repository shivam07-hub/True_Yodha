"use client"

import * as React from "react"
import type { JobPulse } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { fitTier } from "@/lib/dashboard/feed-model"
import { ageLabel, experienceLabel, type FeedCardData, type FitView } from "@/lib/jobs/card-view"
import "./feed-card.css"

const MODE_LABEL: Record<string, string> = { onsite: "On-site", hybrid: "Hybrid", remote: "Remote" }

/** Deterministic per-company logo-tile colour. Replaces the letter-on-black
 *  monogram (the strongest "terminal" tell) with a warm coloured chip while we
 *  don't fetch real favicons. Same company → same hue every render. */
function logoStyle(company: string | null): React.CSSProperties {
  if (!company) return {}
  let h = 0
  for (let i = 0; i < company.length; i++) h = (h * 31 + company.charCodeAt(i)) % 360
  return { "--fc-logo-bg": `hsl(${h} 52% 42%)`, "--fc-logo-ink": "#fff" } as React.CSSProperties
}

/* ── Fit indicator (the top-right slot — ONE component, every surface) ──────── */

/** Donut fit ring (0–100). Arc colour scales with the fit tier (D9).
 *  Internal — surfaces render <FitIndicator>, never this directly. */
function FeedFitRing({ fit, size }: { fit: number; size: number }) {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  const off = c * (1 - Math.max(0, Math.min(100, fit)) / 100)
  return (
    <svg className={`fc-ring fit-${fitTier(fit)}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${fit} percent fit`}>
      <circle className="fc-ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="3" />
      <circle className="fc-ring-arc" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text className="fc-ring-num" x="50%" y="50%" dominantBaseline="central" textAnchor="middle">{fit}</text>
    </svg>
  )
}

/**
 * The ONE fit slot. Every surface (dashboard ring, market skill-pill, upload
 * nudge) renders through here, driven by the `FitView` view-model the adapters
 * compute in `card-view.ts`. The ring-vs-pill choice lives in the data, not at
 * the call site — so adding a surface is one adapter, no new renderer.
 */
export function FitIndicator({ fit, size = 52 }: { fit: FitView; size?: number }) {
  if (!fit) return null
  switch (fit.kind) {
    case "score":
      return <FeedFitRing fit={fit.value} size={size} />
    case "overlap": {
      // Green wash is the *strong* fit signal — reserve it for 3+ overlaps so a
      // thin 1-skill match doesn't shout success (ND1) or clash with the company
      // monogram colour. 1–2 overlaps read in the quiet style.
      const strong = fit.count >= 3
      return (
        <span className={`fc-fitpill${strong ? " fc-fitpill-on" : ""}`}>
          ◉ {fit.count} skill{fit.count === 1 ? "" : "s"}
        </span>
      )
    }
    case "role":
      return <span className="fc-fitpill fc-fitpill-on">◉ your role</span>
    case "none":
      return <span className="fc-fitpill">no overlap yet</span>
    case "nudge":
      return (
        <a href="/cv" onClick={(e) => e.stopPropagation()} className="fc-fitpill fc-fitpill-nudge">
          Upload CV →
        </a>
      )
  }
}

/* ── Listing-confidence dim (D1) — surface-neutral, styled by feed-card.css ── */
export function feedCardConfidenceClass(pulse?: JobPulse): string {
  switch (pulse?.listing_confidence) {
    case "uncertain":
      return " fc-conf-uncertain"
    case "likely_closed":
    case "closed":
      return " fc-conf-closed"
    default:
      return ""
  }
}

/* ── The one card ─────────────────────────────────────────────────────────── */

export interface FeedCardProps {
  data: FeedCardData
  /** Top-right slot override. Normally omitted — the card renders <FitIndicator>
   *  from `data.fit`. Pass a node only to override (rare). */
  fit?: React.ReactNode
  /** Fit-ring diameter when the card auto-renders from `data.fit` (mobile = 44). */
  fitSize?: number
  /** Status chips beside the company (Applied / You added). */
  badges?: React.ReactNode
  /** Trust row above the actions — pass the live <PulseRow>. */
  pulse?: React.ReactNode
  /** Bottom action row — triage (market) or like/skip/tailor (dashboard). */
  actions?: React.ReactNode
  /** "row" = compact list card; "immersive" = tall single-screen card (mobile). */
  variant?: "row" | "immersive"
  open?: boolean
  leaving?: boolean
  /** Extra class — listing-confidence dim, hint shake, etc. */
  extraClass?: string
  onOpen?: () => void
  /** Spread onto the <article> — swipe transform + pointer handlers (immersive). */
  articleProps?: React.HTMLAttributes<HTMLElement>
}

export function FeedCard({
  data, fit, fitSize, badges, pulse, actions, variant = "row", open, leaving, extraClass = "", onOpen, articleProps,
}: FeedCardProps) {
  const age = ageLabel(data.ageIso)
  const exp = experienceLabel(data.minYears, data.maxYears)
  const showMode = data.locationMode && (!data.location || !data.location.toLowerCase().includes(data.locationMode))
  const hasLoc = data.locations.length > 0 || data.location || showMode
  const hasMeta = data.datePosted || data.seniority || exp
  // The fit slot is derived from the data by default; an explicit `fit` node overrides.
  const fitNode = fit ?? <FitIndicator fit={data.fit} size={fitSize} />
  const hasFit = fit != null || data.fit != null

  return (
    <article
      className={`fc-card fc-${variant}${open ? " is-open" : ""}${leaving ? " is-leaving" : ""}${extraClass}`}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={onOpen}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && onOpen) {
          e.preventDefault()
          onOpen()
        }
      }}
      {...articleProps}
    >
      <div className="fc-row">
        <span className="fc-mono" style={logoStyle(data.company)} aria-hidden>{(data.company ?? "—").slice(0, 1)}</span>
        <div className="fc-body">
          <div className="fc-top">
            <span className="fc-co">{data.company ?? "—"}</span>
            {badges}
            {age ? <span className="fc-age">{age}</span> : null}
          </div>
          <h3 className="fc-role">{data.role}</h3>

          {hasLoc ? (
            <div className="fc-loc">
              {data.locations.length > 0
                ? data.locations.map((c) => <span key={c}>{c}</span>)
                : data.location ? <span>{data.location}</span> : null}
              {showMode ? <span className="fc-loc-mode">{MODE_LABEL[data.locationMode!] ?? data.locationMode}</span> : null}
            </div>
          ) : null}

          {hasMeta ? (
            <div className="fc-meta">
              {data.datePosted ? <span className="fc-metachip">Posted {data.datePosted}</span> : null}
              {data.seniority ? <span className="fc-metachip">{data.seniority}</span> : null}
              {exp ? <span className="fc-metachip">{exp}</span> : null}
            </div>
          ) : null}

          {data.chips.length > 0 ? (
            <div className="fc-chips">
              {data.chips.map((c) => (
                <span key={c.name} className={`fc-chip${c.matched ? " is-match" : ""}`}>
                  {c.matched ? <Check8 /> : null}
                  <span className="fc-chip-name">{c.name}</span>
                </span>
              ))}
              {data.extraChipCount > 0 ? (
                <span className="fc-chip fc-chip-more">+{data.extraChipCount}</span>
              ) : null}
            </div>
          ) : null}
        </div>
        {hasFit ? <div className="fc-fit">{fitNode}</div> : null}
      </div>

      {pulse}
      {actions ? <div className="fc-actions">{actions}</div> : null}
    </article>
  )
}

/**
 * Loading shape for <FeedCard variant="row">. Co-located beside the real card so
 * a layout change forces this to move with it (the dashboard-loading grill Q13
 * doctrine — no central skeleton to orphan). Reuses the real `fc-*` classes, so
 * the live card lands in the exact same box with no reflow. The ONE feed-card
 * loading shape — every surface (market, dashboard, bootstrap) renders this, not
 * a hand-rolled box. Decorative; aria-hidden.
 */
export function FeedCardSkeleton() {
  return (
    <article className="fc-card fc-row" aria-hidden="true">
      <div className="fc-row" style={{ width: "100%" }}>
        <Skeleton style={{ width: 42, height: 42, borderRadius: 12, flex: "0 0 auto" }} />
        <div className="fc-body">
          <Skeleton style={{ width: 110, height: 13, borderRadius: 4 }} />
          <Skeleton style={{ width: "72%", height: 17, borderRadius: 6 }} />
          <Skeleton style={{ width: 150, height: 12, borderRadius: 4 }} />
          <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
            <Skeleton style={{ width: 88, height: 22, borderRadius: 999 }} />
            <Skeleton style={{ width: 116, height: 22, borderRadius: 999 }} />
            <Skeleton style={{ width: 72, height: 22, borderRadius: 999 }} />
          </div>
        </div>
      </div>
    </article>
  )
}

function Check8() {
  return (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12.5l5 5L20 7" />
    </svg>
  )
}
