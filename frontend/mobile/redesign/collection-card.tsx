"use client"

import Link from "next/link"
import type { CollectionEntry, JobPulse } from "@/lib/api"
import { ORIGIN_LABEL, heroFor } from "@/lib/collections/model"
import { companyHref } from "@/components/companies/company-link"
import type { MobileJobRow } from "./job-model"

const CIRC = 103.7

/** Compact trust line from the batched Job Pulse — the crowd's ghost verdict
 *  ("N reported gone") supersedes the generic verified stamp. null counts =
 *  privacy cohort under five, never zero (same contract as PulseRow). */
export function pulseLine(pulse?: JobPulse): { text: string; warn: boolean } | null {
  if (!pulse) return null
  const gone = pulse.quality_report_count != null && pulse.quality_report_count > 0 ? pulse.quality_report_count : null
  if (gone) return { text: `${gone} reported gone`, warn: true }
  if (pulse.listing_confidence === "likely_closed" || pulse.listing_confidence === "closed")
    return { text: "apply link may be closed", warn: true }
  if (pulse.last_verified_at) {
    const days = Math.floor((Date.now() - new Date(pulse.last_verified_at).getTime()) / 86_400_000)
    return { text: `Verified ${days <= 0 ? "today" : `${days}d ago`}`, warn: false }
  }
  return null
}

/** Shared card shell — logo / company / role / meta / trust line / fit ring.
 *  The action row is passed as children so every stage differs only in its
 *  footer. Grade is deliberately NOT here: beside the ring it is a second
 *  "how good", the collision the Jobs face locked out. It stays on the row for
 *  the detail sheet. */
function CardShell({
  row,
  fitKnown,
  statusChip,
  pulse,
  onOpen,
  children,
}: {
  row: MobileJobRow
  fitKnown: boolean
  statusChip?: string
  pulse?: JobPulse
  onOpen: () => void
  children: React.ReactNode
}) {
  const trust = pulseLine(pulse)
  return (
    <div onClick={onOpen} style={{ background: "var(--mm-card)", border: "1px solid var(--mm-hair)", borderRadius: 16, padding: "13px 14px 11px", cursor: "pointer", animation: "mm-screenIn 260ms cubic-bezier(0.16,1,0.3,1) both", opacity: trust?.warn ? 0.92 : 1 }}>
      <div style={{ display: "flex", gap: 11 }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: row.logoBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: "#fff", flex: "none" }}>{row.coInitial}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--mm-text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.co}</span>
            {statusChip && <span style={{ fontSize: 10, fontWeight: 700, color: statusChip === "Applied" ? "var(--mm-accent)" : "var(--mm-muted)", background: statusChip === "Applied" ? "var(--mm-accent-wash)" : "var(--mm-hair)", borderRadius: 5, padding: "1.5px 6px", flex: "none" }}>{statusChip}</span>}
            {row.ago && <span style={{ fontSize: 11, color: "var(--mm-dim)", flex: "none", marginLeft: "auto" }}>{row.ago}</span>}
          </div>
          <div style={{ fontSize: 15, fontWeight: 650, letterSpacing: "-0.01em", lineHeight: 1.28, marginTop: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{row.role}</div>
          <div style={{ fontSize: 11.5, color: "var(--mm-faint)", marginTop: 3 }}>{row.metaLine}</div>
          {trust && (
            <div style={{ fontSize: 10.5, marginTop: 3, color: trust.warn ? "var(--mm-warn)" : "var(--mm-dim)", fontWeight: trust.warn ? 650 : 400 }}>
              {trust.warn ? "⚠ " : ""}{trust.text}
            </div>
          )}
        </div>
        <div style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, width: 44 }}>
          <div style={{ position: "relative", width: 40, height: 40 }}>
            <svg width={40} height={40} viewBox="0 0 40 40" aria-hidden="true">
              <circle cx="20" cy="20" r="16.5" fill="none" stroke="var(--mm-border)" strokeWidth="3" />
              {fitKnown && <circle cx="20" cy="20" r="16.5" fill="none" stroke={row.ringColor} strokeWidth="3" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - row.fit / 100)} transform="rotate(-90 20 20)" />}
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700, color: fitKnown ? "var(--mm-text)" : "var(--mm-dim)" }}>{fitKnown ? row.fit : "—"}</div>
          </div>
          {fitKnown && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", color: row.ringColor, textTransform: "uppercase", whiteSpace: "nowrap" }}>{row.verdict}</span>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>{children}</div>
    </div>
  )
}

/** ONE collection card. The stage picks the hero; every other slot is fixed.
 *  It replaced `CollectionCard` + `MyroFoundCard`, which had different action
 *  sets, and a heart that meant "priority" on one and "save" on the other. */
export function CollectionCard({
  entry,
  row,
  fitKnown,
  pulse,
  onOpen,
  onRemove,
  onPriority,
  onShare,
  onSnooze,
  onAnswerPending,
}: {
  entry: CollectionEntry
  row: MobileJobRow
  fitKnown: boolean
  pulse?: JobPulse
  onOpen: () => void
  onRemove: () => void
  onPriority: (next: boolean) => void
  onShare: () => void
  onSnooze: () => void
  onAnswerPending: (submitted: boolean) => void
}) {
  const hero = heroFor(entry)
  const canPrioritize = entry.stage !== "found" && entry.stage !== "closed"
  const canRemove = entry.stage !== "applied"
  const statusChip = entry.stage === "closed"
    ? "Closed"
    : entry.stage === "applied"
      ? (entry.status && entry.status !== "applied" ? STATUS_WORD[entry.status] ?? "Applied" : "Applied")
      : ORIGIN_LABEL[entry.origin]

  return (
    <CardShell row={row} fitKnown={fitKnown} statusChip={statusChip} pulse={pulse} onOpen={onOpen}>
      {canRemove ? (
        <button onClick={(e) => { e.stopPropagation(); onRemove() }} aria-label="Remove from Collections" className="mm-press-sm tm-dismiss-action" style={iconBtn}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      ) : null}
      {canPrioritize ? (
        <button
          onClick={(e) => { e.stopPropagation(); onPriority(!entry.is_priority) }}
          aria-label={entry.is_priority ? "Remove job priority" : "Prioritize this job"}
          aria-pressed={entry.is_priority}
          className="mm-press-sm"
          style={iconBtn}
        >
          <svg width={15} height={15} viewBox="0 0 24 24" fill={entry.is_priority ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" color={entry.is_priority ? "var(--mm-accent)" : "var(--mm-muted)"}><path d="M19 14c1.5-1.5 2-3.2 2-4.6C21 6.4 18.6 4 15.6 4 14.2 4 12.9 4.6 12 5.6 11.1 4.6 9.8 4 8.4 4 5.4 4 3 6.4 3 9.4c0 1.4.5 3.1 2 4.6l7 6.6 7-6.6Z" /></svg>
        </button>
      ) : null}
      <button onClick={(e) => { e.stopPropagation(); onShare() }} aria-label="Share" className="mm-press-sm" style={iconBtn}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V4m0 0 4 4m-4-4L8 8" /><path d="M4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /></svg>
      </button>
      {entry.stage === "saved" || entry.stage === "tailored" ? (
        <button onClick={(e) => { e.stopPropagation(); onSnooze() }} aria-label="Snooze for 3 days" title="Snooze for 3 days" className="mm-press-sm" style={iconBtn}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></svg>
        </button>
      ) : null}
      <div style={{ flex: 1 }} />
      {/* THE hero — one slot, verb by stage. */}
      {hero.href ? (
        <Link href={hero.href} onClick={(e) => e.stopPropagation()} className="mm-press" style={heroStyle(hero.kind)}>
          {hero.label}
        </Link>
      ) : (
        <a
          href={entry.job.company ? companyHref(entry.job.company) : "/market"}
          target={entry.job.company ? "_blank" : undefined}
          rel={entry.job.company ? "noopener noreferrer" : undefined}
          onClick={(e) => e.stopPropagation()}
          className="mm-press"
          style={heroStyle("quiet")}
        >
          {hero.label} ↗
        </a>
      )}
      {/* The ask the 1.2s inline band never got to make. */}
      {entry.pending_apply ? (
        <div onClick={(e) => e.stopPropagation()} style={{ flexBasis: "100%", display: "flex", alignItems: "center", gap: 8, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--mm-hair)", fontSize: 12 }}>
          <span style={{ color: "var(--mm-text-2)" }}>Did you submit it?</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => onAnswerPending(true)} className="mm-press-sm" style={heroStyle("go")}>Yes, applied</button>
          <button onClick={() => onAnswerPending(false)} className="mm-press-sm" style={heroStyle("quiet")}>Not yet</button>
        </div>
      ) : null}
    </CardShell>
  )
}

/** The post-apply words. `stage` is `applied` for all of them — this names WHICH
 *  outcome, which the old folder could not say at all. */
const STATUS_WORD: Record<string, string> = {
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  ghosted: "No reply",
}

function heroStyle(kind: "go" | "gap" | "quiet"): React.CSSProperties {
  const base: React.CSSProperties = {
    height: 32, padding: "0 14px", borderRadius: 99, display: "inline-flex", alignItems: "center",
    fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", textDecoration: "none", cursor: "pointer",
    whiteSpace: "nowrap",
  }
  if (kind === "go") return { ...base, border: "none", background: "var(--mm-accent)", color: "var(--mm-accent-fg)" }
  if (kind === "gap") return { ...base, border: "1px solid rgba(79,199,246,0.35)", background: "var(--mm-accent-wash)", color: "var(--mm-accent)" }
  return { ...base, border: "1px solid var(--mm-border)", background: "transparent", color: "var(--mm-text-2)" }
}

const iconBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 99, border: "1px solid var(--mm-border)", background: "transparent",
  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
}
