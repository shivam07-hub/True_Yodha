"use client"

import type { JobFeedItem, JobPulse } from "@/lib/api"
import { PulseRow } from "@/components/dashboard/card-atoms"
import { FeedCard, feedCardConfidenceClass } from "@/components/jobs/feed-card"
import { feedDataFromFeedItem } from "@/lib/jobs/card-view"

// ── shared helpers (used by card, drawer, mobile feed) ───────────────────────

export function jdSnippet(text: string | null | undefined, max = 180): string {
  if (!text) return ""
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat
}

/** first_seen is an ISO date (day-granular). Compact age badge. */
export function ageLabel(iso: string | null | undefined): string | null {
  if (!iso) return null
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return null
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000)
  if (days <= 0) return "today"
  if (days === 1) return "1d ago"
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

const MODE_LABEL: Record<string, string> = { onsite: "On-site", hybrid: "Hybrid", remote: "Remote" }

export function SkillChip({ label }: { label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 999, fontSize: 11, background: "var(--tm-surface-2, var(--tm-surface))", border: "1px solid var(--tm-border-soft)", color: "var(--tm-text-muted)", whiteSpace: "nowrap" }}>
      {label}
    </span>
  )
}

export function LocationLine({ job }: { job: JobFeedItem }) {
  const loc = job.location?.trim() || null
  const mode = job.location_mode && job.location_mode !== "unknown" ? job.location_mode : null
  const showMode = mode && (!loc || !loc.toLowerCase().includes(mode))
  const cities = (job.locations ?? []).filter(c => c && c.trim())
  if (!loc && cities.length === 0 && !showMode) return null
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--tm-text-muted)", flexWrap: "wrap" }}>
      {cities.length > 0 ? cities.map(c => <span key={c}>{c}</span>) : loc ? <span>{loc}</span> : null}
      {showMode ? (
        <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase", padding: "2px 7px", borderRadius: 999, border: "1px solid var(--tm-border-soft)", color: "var(--tm-text-faint)" }}>
          {MODE_LABEL[mode!] ?? mode}
        </span>
      ) : null}
    </div>
  )
}

// ── triage buttons (Save / Skip — the curation front door) ───────────────────

export function TriageButtons({ onSave, onSkip }: { onSave: () => void; onSkip: () => void }) {
  return (
    <div style={{ display: "inline-flex", gap: 8 }}>
      <button
        type="button"
        aria-label="Mark this job as not interested"
        title="Not interested"
        onClick={e => { e.stopPropagation(); onSkip() }}
        className="tm-triage-btn tm-triage-skip"
      >
        <span aria-hidden>✕</span> Not interested
      </button>
      <button
        type="button"
        aria-label="Save this job to your shortlist"
        title="Save to shortlist"
        onClick={e => { e.stopPropagation(); onSave() }}
        className="tm-triage-btn tm-triage-save"
      >
        <span aria-hidden>★</span> Save
      </button>
    </div>
  )
}

// ── the card (web list) ──────────────────────────────────────────────────────

export function JobCard({
  job, pulse, hasCv, onOpen, onSave, onSkip,
}: {
  job: JobFeedItem
  pulse?: JobPulse
  hasCv: boolean
  onOpen: () => void
  onSave: () => void
  onSkip: () => void
}) {
  return (
    <FeedCard
      data={feedDataFromFeedItem(job, { hasCv })}
      variant="row"
      extraClass={feedCardConfidenceClass(pulse)}
      onOpen={onOpen}
      pulse={<PulseRow pulse={pulse} bare />}
      actions={<TriageButtons onSave={onSave} onSkip={onSkip} />}
    />
  )
}
