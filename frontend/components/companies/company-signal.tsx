"use client"

/**
 * The Company Signal unit — ONE component family for every company treatment in
 * the product (Signal Thread, handoff 1b). Replaces the four ad-hoc treatments:
 * market-rail's random-hue hashed rows, peek-card bare text chips, heatmap logo
 * cards, and panel ranked rows.
 *
 * Two invariants carry the "one live intel engine" feeling:
 *  1. The logo tile is ALWAYS accent-wash + mono initials (never a per-company
 *     random hue) — the accent token is theme-directional (azure dark / deeper azure
 *     light, L6) so the tile brands with the surface it sits on.
 *  2. All numbers are mono (var(--tm-font-mono)).
 *
 * S1 renders real data only (open-role counts). The pulse score / weekly delta /
 * sparkline are S2 backend work — this file deliberately carries no pulse props
 * yet, so no surface can show a number that isn't computed.
 */

import Link from "next/link"
import type { CSSProperties, ReactNode } from "react"
import { companyInitials } from "@/lib/companies/company-initials"
import type { FollowCompanyAction } from "@/lib/hooks/use-follow-company"
import { FollowCompanyControl } from "./follow-company-control"
import "./company-signal.css"

export { companyInitials }

export type CompanySignalSize = "xl" | "l" | "m" | "s"

const TILE_PX: Record<CompanySignalSize, number> = { xl: 46, l: 34, m: 20, s: 26 }

/**
 * The universal company logo tile: accent-wash background, mono initials. The
 * single source of the tile geometry — swap in a real logo later by rendering an
 * <img> here and keeping the same box.
 */
export function CompanyTile({
  name,
  size = "s",
  className,
}: {
  name: string
  size?: CompanySignalSize
  className?: string
}) {
  const px = TILE_PX[size]
  const style: CSSProperties = {
    width: px,
    height: px,
    borderRadius: size === "s" ? 7 : size === "m" ? 6 : size === "xl" ? 10 : 8,
    fontSize: size === "xl" ? 15 : size === "l" ? 13 : size === "m" ? 9 : 10,
  }
  return (
    <span className={`cs-tile${className ? ` ${className}` : ""}`} style={style} aria-hidden>
      {companyInitials(name)}
    </span>
  )
}

/**
 * The signal label: a pulsing accent dot + mono-caps label that opens every
 * engine-powered section. The pulse (a live-data brand mark) is CSS-only and
 * respects prefers-reduced-motion (static dot).
 */
export function SignalLabel({ children, live = true }: { children: ReactNode; live?: boolean }) {
  return (
    <span className="cs-signal-label">
      <span className={`cs-signal-dot${live ? " is-live" : ""}`} aria-hidden />
      {children}
    </span>
  )
}

interface RowProps {
  name: string
  /** Trailing meta — real count/label. Mono-styled by the row. */
  meta?: ReactNode
  followed?: boolean
  href?: string
  onClick?: () => void
  followAction?: FollowCompanyAction
  size?: Extract<CompanySignalSize, "s">
}

/**
 * S-size list row: tile + name + trailing mono meta. Renders as a link (href),
 * a button (onClick), or a plain div. Used in the market rail, heatmap company
 * strip, and ranked panel lists.
 */
export function CompanySignalRow({ name, meta, followed, href, onClick, followAction, size = "s" }: RowProps) {
  const inner = (
    <>
      <CompanyTile name={name} size={size} />
      <span className="cs-row-name">
        {name}
        {followed ? <span className="cs-row-star" aria-label="Following">★</span> : null}
      </span>
      {meta != null ? <span className="cs-row-meta">{meta}</span> : null}
    </>
  )
  const primary = href
    ? <Link href={href} className="cs-row">{inner}</Link>
    : onClick
      ? <button type="button" className="cs-row" onClick={onClick}>{inner}</button>
      : <div className="cs-row">{inner}</div>
  if (!followAction) return primary
  return <div className="cs-row-wrap">{primary}<FollowCompanyControl company={name} action={followAction} /></div>
}

/**
 * Tiny token-correct sparkline for the L card — accent polyline + endpoint dot.
 * Flat/degenerate series (all-equal) draws a midline so it never disappears.
 */
export function Signalline({ data, width = 96, height = 30 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const span = max - min || 1
  const px = (i: number) => (i / (data.length - 1)) * (width - 4) + 2
  const py = (v: number) => height - 3 - ((v - min) / span) * (height - 8)
  const pts = data.map((v, i) => `${px(i)},${py(v)}`).join(" ")
  const lastX = px(data.length - 1)
  const lastY = py(data[data.length - 1])
  return (
    <svg className="cs-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--tm-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2.4" fill="var(--tm-accent)" />
    </svg>
  )
}

/** Real pulse payload shape (mirrors CompanyPulseItem from the API). */
export interface CompanyPulseData {
  open_roles: number
  weekly_delta: number
  pulse: number | null
  series: number[]
  last_seen_at?: string | null
}

interface CardProps {
  name: string
  /** undefined = still loading; a value with pulse===null = live but no signal. */
  pulse?: CompanyPulseData
  topSkill?: string | null
  followed?: boolean
  /** Highest-pulse card in a set → accent-ring border. */
  highlight?: boolean
  href?: string
  followAction?: FollowCompanyAction
}

/**
 * L-size compare card (handoff 1a compare strip / 1d directory). Header (tile +
 * name + open/top sub-line + follow star) → pulse number + sparkline + weekly
 * delta. Honest states: no data yet → "…"; live but pulse===null (no open
 * roles) → em-dash "no live roles"; a real pulse → the number. Never fabricates.
 */
export function CompanySignalCard({ name, pulse, topSkill, followed, highlight, href, followAction }: CardProps) {
  const loading = pulse === undefined
  const noSignal = !loading && pulse.pulse === null
  const subParts: string[] = []
  if (!loading) subParts.push(`${pulse.open_roles} open role${pulse.open_roles === 1 ? "" : "s"}`)
  if (topSkill) subParts.push(`top: ${topSkill}`)

  const header = (
    <>
      <CompanyTile name={name} size="l" />
      <div className="cs-card-id">
        <span className="cs-card-name">{name}</span>
        {subParts.length ? <span className="cs-card-sub">{subParts.join(" · ")}</span> : null}
      </div>
    </>
  )
  const metric = (
    <div className="cs-card-metric">
        <div className="cs-card-pulse">
          <span className="cs-card-pulse-num">{loading ? "…" : noSignal ? "—" : pulse.pulse}</span>
          <span className="cs-card-pulse-label">Demand pulse</span>
        </div>
        {!loading && !noSignal ? (
          <div className="cs-card-trend">
            <Signalline data={pulse.series} />
            {pulse.weekly_delta > 0 ? (
              <span className="cs-card-delta">▲ {pulse.weekly_delta} this week</span>
            ) : (
              <span className="cs-card-delta is-flat">no new roles</span>
            )}
          </div>
        ) : noSignal ? (
          <span className="cs-card-quiet">no live roles</span>
        ) : null}
    </div>
  )

  const className = `cs-card${highlight ? " is-top" : ""}`
  const follow = followAction
    ? <FollowCompanyControl company={name} action={followAction} />
    : followed ? <span className="cs-card-star is-on" aria-label="Following">★</span> : null
  if (href) {
    return (
      <article className={className}>
        <div className="cs-card-head"><Link href={href} className="cs-card-link">{header}</Link>{follow}</div>
        <Link href={href} className="cs-card-metric-link">{metric}</Link>
      </article>
    )
  }
  return <div className={className}><div className="cs-card-head">{header}{follow}</div>{metric}</div>
}

interface ChipProps {
  name: string
  meta?: ReactNode
  followed?: boolean
  href?: string
  onClick?: () => void
}

/**
 * M-size chip: pill with tile + name + mono meta. Never a bare text pill — the
 * tile and count always ride along (handoff 1b). Used in peek cards and filters.
 */
export function CompanySignalChip({ name, meta, followed, href, onClick }: ChipProps) {
  const inner = (
    <>
      <CompanyTile name={name} size="m" />
      <span className="cs-chip-name">{name}</span>
      {followed ? <span className="cs-chip-star" aria-label="Following">★</span> : null}
      {meta != null ? <span className="cs-chip-meta">{meta}</span> : null}
    </>
  )
  if (href) return <Link href={href} className="cs-chip">{inner}</Link>
  if (onClick) return <button type="button" className="cs-chip" onClick={onClick}>{inner}</button>
  return <span className="cs-chip">{inner}</span>
}
