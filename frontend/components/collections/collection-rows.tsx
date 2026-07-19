"use client"

import * as React from "react"
import Link from "next/link"
import { X } from "lucide-react"
import { FeedCard, feedCardConfidenceClass } from "@/components/jobs/feed-card"
import { feedDataFromMatch } from "@/lib/jobs/card-view"
import { PulseRow } from "@/components/dashboard/card-atoms"
import { GradeBadge, LegitimacyBadge } from "@/components/jobs/match-brain"
import { isExtSource, isMyroSource } from "@/lib/collections/model"
import type { ApplicationResponse, JobPulse } from "@/lib/api"
import type { FeedItem } from "@/lib/dashboard/feed-model"

/* Row skins for the Myro Ops folder. Both wrap the shared FeedCard; the actions
   differ by spine: an above-bar brain match (Tailor / Dismiss, no save —
   it's already in the folder) vs a saved application (unsave / Tailor). */

function useLeave(): [boolean, (fn: () => void) => void] {
  const [leaving, setLeaving] = React.useState(false)
  const leaveThen = (fn: () => void) => {
    setLeaving(true)
    window.setTimeout(fn, 230)
  }
  return [leaving, leaveThen]
}

/** An above-bar Myro Search match. Carries its real brain grade + legitimacy. */
export function MyroFoundRow({
  it,
  open,
  pulse,
  onOpen,
  onTailor,
  onDismiss,
}: {
  it: FeedItem
  open: boolean
  pulse?: JobPulse
  onOpen: () => void
  onTailor: () => void
  onDismiss: () => void
}) {
  const [leaving, leaveThen] = useLeave()
  const job = it.job
  return (
    <FeedCard
      data={feedDataFromMatch({ jobId: it.jobId, company: it.company, role: it.role, job, fit: it.fit })}
      variant="row"
      open={open}
      leaving={leaving}
      extraClass={feedCardConfidenceClass(pulse)}
      onOpen={onOpen}
      badges={
        <>
          <GradeBadge grade={job.grade} />
          <LegitimacyBadge tier={job.legitimacy_tier} reason={job.legitimacy_reason} />
        </>
      }
      pulse={<PulseRow pulse={pulse} />}
      actions={
        <div className="db-card-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="db-icon-btn"
            aria-label="Not interested"
            title="Not interested"
            onClick={() => leaveThen(onDismiss)}
          >
            <X size={16} aria-hidden />
          </button>
          <button type="button" className="db-btn db-btn-primary tm-control-focus" onClick={onTailor}>
            Tailor CV
          </button>
        </div>
      }
    />
  )
}

/** A saved application (You added / Applied chips) — unsave + Tailor. */
export function CollectionRow({
  it,
  app,
  open,
  pulse,
  onOpen,
  onUnsave,
  onTailor,
  onOpenCv,
  onSnooze,
  onSaveNote,
}: {
  it: FeedItem
  app: ApplicationResponse | undefined
  open: boolean
  pulse?: JobPulse
  onOpen: () => void
  onUnsave: () => void
  onTailor: () => void
  onOpenCv: () => void
  onSnooze: () => void
  onSaveNote: (note: string) => void
}) {
  const applied = app ? app.status !== "saved" : false
  const tailored = !!app?.cv_badge
  const [noteOpen, setNoteOpen] = React.useState(false)
  const [note, setNote] = React.useState(app?.notes ?? "")
  const attention = app?.collection_attention_level
  return (
    <div>
    <FeedCard
      data={feedDataFromMatch({ jobId: it.jobId, company: it.company, role: it.role, job: it.job, fit: it.fit })}
      variant="row"
      open={open}
      extraClass={feedCardConfidenceClass(pulse)}
      onOpen={onOpen}
      badges={
        <>
          {applied ? <span className="db-statuschip">Applied</span> : null}
          {!applied && attention ? <span className="db-statuschip">Needs a decision</span> : null}
          {app && isExtSource(app.source) ? <span className="db-sourcechip">Extension</span> : null}
          {app && !isExtSource(app.source) && !isMyroSource(app.source) ? (
            <span className="db-sourcechip">You added</span>
          ) : null}
        </>
      }
      pulse={<PulseRow pulse={pulse} />}
      actions={
        <div className="db-card-actions" onClick={(e) => e.stopPropagation()}>
          {!applied ? (
            <button
              type="button"
              className="db-icon-btn liked"
              aria-label="Remove from Collections"
              title="Remove from Collections"
              onClick={onUnsave}
            >
              <HeartGlyph />
            </button>
          ) : null}
          {!applied ? (
            <>
              <button type="button" className="db-btn db-btn-secondary tm-control-focus" onClick={() => setNoteOpen((open) => !open)}>
                Note
              </button>
              <button type="button" className="db-btn db-btn-secondary tm-control-focus" onClick={onSnooze}>
                Snooze 3d
              </button>
            </>
          ) : null}
          {tailored ? (
            <button type="button" className="db-btn db-btn-secondary tm-control-focus" onClick={onOpenCv}>
              Tailored ✓
            </button>
          ) : !applied ? (
            <button type="button" className="db-btn db-btn-primary tm-control-focus" onClick={onTailor}>
              Tailor CV
            </button>
          ) : null}
          {applied ? (
            <Link
              href={`/preparations/${encodeURIComponent(it.jobId)}`}
              className="db-btn db-btn-primary tm-control-focus"
              style={{ textDecoration: "none" }}
            >
              Prep room →
            </Link>
          ) : null}
        </div>
      }
    />
    {noteOpen ? (
      <textarea
        aria-label={`Note for ${it.role}`}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onBlur={() => onSaveNote(note)}
        placeholder="Why this role is worth applying to…"
        rows={2}
        style={{ width: "100%", marginTop: 8, padding: "9px 10px", borderRadius: 8, border: "1px solid var(--tm-border)", background: "var(--tm-surface-2)", color: "var(--tm-text)", resize: "vertical" }}
      />
    ) : null}
    </div>
  )
}

function HeartGlyph() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 14c1.5-1.5 2-3.2 2-4.6C21 6.4 18.6 4 15.6 4 14.2 4 12.9 4.6 12 5.6 11.1 4.6 9.8 4 8.4 4 5.4 4 3 6.4 3 9.4c0 1.4.5 3.1 2 4.6l7 6.6 7-6.6Z" />
    </svg>
  )
}
