"use client"

import type { JobFeedItem, JobPulse } from "@/lib/api"
import { PulseRow } from "@/components/dashboard/card-atoms"
import { FeedCard, feedCardConfidenceClass, feedCardRereadClass } from "@/components/jobs/feed-card"
import { LegitimacyBadge } from "@/components/jobs/match-brain"
import { CapturePill } from "@/components/jobs/capture-pill"
import { ageLabel, feedDataFromFeedItem } from "@/lib/jobs/card-view"
import { MODE_LABEL } from "@/lib/jobs/card-logistics"
import Link from "next/link"
import { ShareJobButton } from "@/components/market/share-job-button"

// ── shared helpers (used by card, drawer, mobile feed) ───────────────────────

export function jdSnippet(text: string | null | undefined, max = 180): string {
  if (!text) return ""
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat
}

export { ageLabel }

export function SkillChip({ label }: { label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 10, fontSize: "var(--tm-fs-caption)", background: "var(--tm-surface-2, var(--tm-surface))", border: "1px solid var(--tm-border-soft)", color: "var(--tm-text-muted)", whiteSpace: "nowrap" }}>
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
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "var(--tm-fs-body)", color: "var(--tm-text-muted)", flexWrap: "wrap" }}>
      {cities.length > 0 ? cities.map(c => <span key={c}>{c}</span>) : loc ? <span>{loc}</span> : null}
      {showMode ? (
        <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: "var(--tm-fs-caption)", letterSpacing: "0.04em", textTransform: "uppercase", padding: "2px 7px", borderRadius: 10, border: "1px solid var(--tm-border-soft)", color: "var(--tm-text-faint)" }}>
          {MODE_LABEL[mode!] ?? mode}
        </span>
      ) : null}
    </div>
  )
}

// ── triage buttons (Skip / Save / Tailor CV — the curation front door) ───────

export function TriageButtons({ job, onSave, onSkip, onTailor }: {
  job: JobFeedItem
  onSave: () => void
  onSkip: () => void
  /** Save this job and open the CV editor for it. The card's primary action:
   *  Save is the quiet outline beside it (capture-pill.css). */
  onTailor?: () => void
}) {
  const label = job.job_title ? `${job.job_title}${job.company_name ? ` at ${job.company_name}` : ""}` : undefined
  return (
    <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <button
        type="button"
        aria-label="Mark this job as not interested"
        title="Not interested"
        onClick={e => { e.stopPropagation(); onSkip() }}
        className="tm-triage-btn tm-triage-skip tm-dismiss-action"
      >
        <span aria-hidden>✕</span> Skip
      </button>
      {/* The ONE capture control (unified). Market saving drains the card, so the
          pill only ever shows its rest state here; the confirmation + next-step
          live in the upgraded triage band. */}
      <CapturePill status="rest" onSave={onSave} label={label} />
      {job.listing_venue === "myro" ? (
        <Link
          href={`/internships/${encodeURIComponent(job.job_id)}/apply`}
          aria-label={label ? `Apply here for ${label}` : "Apply here"}
          onClick={e => e.stopPropagation()}
          className="tm-triage-btn tm-triage-tailor"
        >
          Apply here
        </Link>
      ) : null}
      {onTailor ? (
        <button
          type="button"
          aria-label={label ? `Tailor CV for ${label}` : "Tailor CV for this job"}
          onClick={e => { e.stopPropagation(); onTailor() }}
          className={job.listing_venue === "myro" ? "tm-triage-btn tm-triage-skip" : "tm-triage-btn tm-triage-tailor"}
        >
          Tailor CV
        </button>
      ) : null}
      <ShareJobButton job={job} />
    </div>
  )
}

/** Cached Matching-Brain badges on the card header. The judge is the fit ring
 *  (Match Verdict). Grade is a second "how good" and lives in Why, not here.
 *  This slot is only the posting-trust warning (caution / suspicious). */
export function CardBrainBadges({ job }: { job: JobFeedItem }) {
  if (job.legitimacy_tier !== "caution" && job.legitimacy_tier !== "suspicious") return null
  return <LegitimacyBadge tier={job.legitimacy_tier} reason={job.legitimacy_reason} />
}

// ── the card (web list) ──────────────────────────────────────────────────────

export function JobCard({
  job, pulse, hasCv, onOpen, onSave, onSkip, onTailor, lede,
}: {
  job: JobFeedItem
  pulse?: JobPulse
  hasCv: boolean
  onOpen: () => void
  onSave: () => void
  onSkip: () => void
  onTailor?: () => void
  /** Agent Picks pass Myro's reason for the pick; the feed passes nothing. */
  lede?: React.ReactNode
}) {
  return (
    <FeedCard
      data={feedDataFromFeedItem(job, { hasCv })}
      variant="row"
      extraClass={`${feedCardConfidenceClass(pulse)}${feedCardRereadClass(job)}`}
      onOpen={onOpen}
      badges={<CardBrainBadges job={job} />}
      pulse={<PulseRow pulse={pulse} bare />}
      actions={<TriageButtons job={job} onSave={onSave} onSkip={onSkip} onTailor={onTailor} />}
      lede={lede}
    />
  )
}
