"use client"

import type { JobFeedItem, JobPulse } from "@/lib/api"
import { PulseRow, cardConfidenceClass } from "@/components/dashboard/card-atoms"

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

/** The fit slot. Skills-match leads; role-match is a secondary tag. No CV → an
 *  honest upload nudge instead of a fake number. */
export function FitSignal({ job, hasCv }: { job: JobFeedItem; hasCv: boolean }) {
  if (!hasCv) {
    return (
      <a
        href="/cv"
        onClick={e => e.stopPropagation()}
        style={{ textDecoration: "none", fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-interactive-rest)" }}
      >
        Upload CV to see fit →
      </a>
    )
  }
  if (job.matched_skill_count > 0) {
    return (
      <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-success)" }}>
        ◉ {job.matched_skill_count} skill{job.matched_skill_count === 1 ? "" : "s"} match
        {job.target_role_match > 0 ? <span style={{ color: "var(--tm-text-faint)" }}>{" · matches your role"}</span> : null}
      </span>
    )
  }
  if (job.target_role_match > 0) {
    return <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-success)" }}>◉ matches your target role</span>
  }
  return <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-faint)" }}>no skill overlap yet</span>
}

// ── triage buttons (Save / Skip — the curation front door) ───────────────────

export function TriageButtons({ onSave, onSkip }: { onSave: () => void; onSkip: () => void }) {
  return (
    <div style={{ display: "inline-flex", gap: 8 }}>
      <button
        type="button"
        aria-label="Skip this job"
        title="Not for me"
        onClick={e => { e.stopPropagation(); onSkip() }}
        className="tm-triage-btn tm-triage-skip"
      >
        <span aria-hidden>✕</span> Skip
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
  const age = ageLabel(job.first_seen)
  const snippet = jdSnippet(job.job_description)
  return (
    <article onClick={onOpen} className={`tm-job-card${cardConfidenceClass(pulse)}`} style={{ cursor: "pointer", background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-lg)", padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--tm-text)", lineHeight: 1.25 }}>{job.job_title}</h3>
          {job.company_name ? <div style={{ fontSize: 14, color: "var(--tm-interactive)", marginTop: 3 }}>{job.company_name}</div> : null}
        </div>
        {age ? <span style={{ flexShrink: 0, fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.04em", color: "var(--tm-text-faint)" }}>{age}</span> : null}
      </div>

      <LocationLine job={job} />
      {snippet ? <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--tm-text-muted)" }}>{snippet}</p> : null}
      {job.skills.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{job.skills.map(s => <SkillChip key={s} label={s} />)}</div>
      ) : null}

      <PulseRow pulse={pulse} bare />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 2 }}>
        <FitSignal job={job} hasCv={hasCv} />
        <TriageButtons onSave={onSave} onSkip={onSkip} />
      </div>
    </article>
  )
}
