"use client"

import * as React from "react"
import Link from "next/link"
import { Heart, X, Share, Home, FileText, User, Radar } from "lucide-react"
import type { JobMatch } from "@/lib/api"

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
  return (
    <div className={mobile ? "db-mactions" : "db-card-actions"}>
      <button
        type="button"
        className={`db-icon-btn${liked ? " liked" : ""}`}
        aria-label={liked ? "Unlike" : "Like"}
        title={liked ? "Unlike" : "Like"}
        onClick={(e) => {
          e.stopPropagation()
          onLike()
        }}
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

/* Re-export icons used by other dashboard surfaces (mobile tab bar etc). */
export { Home, FileText, User, Radar }
