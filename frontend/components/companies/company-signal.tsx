"use client"

/**
 * The Company Signal unit — ONE component family for every company treatment in
 * the product (Signal Thread, handoff 1b). Replaces the four ad-hoc treatments:
 * market-rail's random-hue hashed rows, peek-card bare text chips, heatmap logo
 * cards, and panel ranked rows.
 *
 * Two invariants carry the "one live intel engine" feeling:
 *  1. The logo tile is ALWAYS accent-wash + mono initials (never a per-company
 *     random hue) — the accent token is theme-directional (teal dark / orange
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
  size?: Extract<CompanySignalSize, "s">
}

/**
 * S-size list row: tile + name + trailing mono meta. Renders as a link (href),
 * a button (onClick), or a plain div. Used in the market rail, heatmap company
 * strip, and ranked panel lists.
 */
export function CompanySignalRow({ name, meta, followed, href, onClick, size = "s" }: RowProps) {
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
  if (href) {
    return <Link href={href} className="cs-row">{inner}</Link>
  }
  if (onClick) {
    return <button type="button" className="cs-row" onClick={onClick}>{inner}</button>
  }
  return <div className="cs-row">{inner}</div>
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
