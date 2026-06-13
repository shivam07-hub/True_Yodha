"use client"

import * as React from "react"
import Link from "next/link"
import { Heart, X, Share, Home, FileText, User, Radar } from "lucide-react"
import type { JobMatch, JobPulse, ResponseSignal } from "@/lib/api"

/* ── Monogram (company letter square) ───────────────────────────── */
export function Monogram({ company, size }: { company: string | null; size?: number }) {
  const style = size ? { width: size, height: size } : undefined
  return (
    <span className="db-monogram" style={style} aria-hidden>
      {(company ?? "—").slice(0, 1)}
    </span>
  )
}

/* ── Fit ring (donut, accent arc = fit%) ────────────────────────── */
export function FitRing({ fit, size = 54 }: { fit: number; size?: number }) {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  const off = c * (1 - Math.max(0, Math.min(100, fit)) / 100)
  return (
    <svg
      className="db-fitring"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${fit} percent fit`}
    >
      <circle className="track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="3" />
      <circle
        className="arc"
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text className="db-fitnum" x="50%" y="50%" dominantBaseline="central" textAnchor="middle">
        {fit}
      </text>
    </svg>
  )
}

/* ── Sparkline (header score trend) ─────────────────────────────── */
export function Sparkline({ data, width = 120, height = 30 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * (width - 4) + 2
      const y = height - 3 - ((v - min) / (max - min || 1)) * (height - 8)
      return `${x},${y}`
    })
    .join(" ")
  return (
    <svg className="db-stat-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--db-accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ── Skill chips on the card (matched = ✓ accent on wash) ───────── */
export interface CardChip {
  name: string
  matched?: boolean
}

export function ChipRow({ chips, className }: { chips: CardChip[]; className: string }) {
  if (chips.length === 0) return null
  return (
    <span className={className}>
      {chips.map((c) => (
        <span key={c.name} className={`db-chip${c.matched ? " match" : ""}`}>
          {c.matched ? <Check8 /> : null}
          {c.name}
        </span>
      ))}
    </span>
  )
}

function Check8() {
  return (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12.5l5 5L20 7" />
    </svg>
  )
}

/* ── Card action row (♥ like · ✕ skip · [share] · Tailor CV) ────── */
export function CardActions({
  jobId,
  liked,
  onLike,
  onSkip,
  mobile,
}: {
  jobId: string
  liked: boolean
  onLike: () => void
  onSkip: () => void
  mobile?: boolean
}) {
  const [pop, setPop] = React.useState(false)
  return (
    <div className={mobile ? "db-mactions" : "db-card-actions"}>
      <button
        type="button"
        className={`db-icon-btn${liked ? " liked" : ""}${pop ? " db-just-liked" : ""}`}
        aria-label={liked ? "Unlike" : "Like"}
        title={liked ? "Unlike" : "Like"}
        onClick={(e) => {
          e.stopPropagation()
          if (!liked) setPop(true) // one-shot pop on the like tap only
          onLike()
        }}
        onAnimationEnd={() => setPop(false)}
      >
        <Heart size={17} fill={liked ? "currentColor" : "none"} aria-hidden />
      </button>
      <button
        type="button"
        className="db-icon-btn"
        aria-label="Skip this job"
        title="Skip"
        onClick={(e) => {
          e.stopPropagation()
          onSkip()
        }}
      >
        <X size={17} aria-hidden />
      </button>
      {mobile ? (
        <button type="button" className="db-icon-btn" aria-label="Share" title="Share" onClick={(e) => e.stopPropagation()}>
          <Share size={16} aria-hidden />
        </button>
      ) : null}
      <span className="db-spacer" />
      <Link
        className="db-btn db-btn-primary db-btn-sm"
        href={`/cv?jobId=${jobId}`}
        onClick={(e) => e.stopPropagation()}
      >
        Tailor CV
      </Link>
    </div>
  )
}

/* ── Card chips derived from a JobMatch (matched skills) ────────── */
export function cardChips(job: JobMatch, max = 4): CardChip[] {
  return (job.matched_skills ?? []).slice(0, max).map((name) => ({ name, matched: true }))
}

/* ── Job Pulse: community trust row + listing-confidence visual state ─── */

/** Card-level confidence class — drives the muted/dimmed visual state (D1).
 *  Surface-neutral (`tm-conf-*`); each surface styles its own dim target. */
export function cardConfidenceClass(pulse?: JobPulse): string {
  switch (pulse?.listing_confidence) {
    case "uncertain":     return " tm-conf-uncertain"
    case "likely_closed":
    case "closed":        return " tm-conf-closed"
    default:              return ""
  }
}

const SIGNAL_LABEL: Record<ResponseSignal, string> = {
  low: "Replies low",
  mixed: "Replies mixed",
  high: "Replies high",
}

function relTime(iso: string | null): string | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const days = Math.floor((Date.now() - then) / 86_400_000)
  if (days <= 0) return "today"
  if (days === 1) return "1d ago"
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return months <= 1 ? "1mo ago" : `${months}mo ago`
}

/**
 * The compact trust row, directly above the action bar. Reserves its height
 * even before the pulse hydrates so the card never jumps; fades in once data
 * arrives. Renders only the values that exist — null community counts mean a
 * privacy cohort under five, never zero, so they're simply omitted.
 */
export function PulseRow({ pulse, mobile, bare }: { pulse?: JobPulse; mobile?: boolean; bare?: boolean }) {
  const edge = bare ? " bare" : ""
  if (!pulse) return <div className={`tm-pulse tm-pulse-reserve${edge}`} aria-hidden />

  const verified = relTime(pulse.last_verified_at)
  const tracking = pulse.tracking_count
  const signal = pulse.response_signal
  const closed = pulse.listing_confidence === "likely_closed" || pulse.listing_confidence === "closed"

  return (
    <div className={`tm-pulse${mobile ? " mobile" : ""}${edge}`}>
      {closed ? (
        <span className="tm-pulse-item tm-pulse-warn">apply link may be closed</span>
      ) : null}
      {verified ? <span className="tm-pulse-item">Verified {verified}</span> : null}
      {tracking != null ? <span className="tm-pulse-item">{tracking} tracking</span> : null}
      {signal ? (
        <span className={`tm-pulse-item tm-pulse-signal ${signal}`}>{SIGNAL_LABEL[signal]}</span>
      ) : null}
    </div>
  )
}

/* Re-export icons used by other dashboard surfaces (mobile tab bar etc). */
export { Home, FileText, User, Radar }
