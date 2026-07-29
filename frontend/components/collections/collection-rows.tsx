"use client"

import * as React from "react"
import Link from "next/link"
import { FeedCard, feedCardConfidenceClass } from "@/components/jobs/feed-card"
import { CardDetailRail } from "@/components/jobs/card-detail-rail"
import { feedDataFromMatch } from "@/lib/jobs/card-view"
import { PulseRow } from "@/components/dashboard/card-atoms"
import { GradeBadge, LegitimacyBadge } from "@/components/jobs/match-brain"
import { companyHref } from "@/components/companies/company-link"
import { isExtSource, isMyroSource } from "@/lib/collections/model"
import type { ApplicationResponse, JobPulse } from "@/lib/api"
import type { FeedItem } from "@/lib/dashboard/feed-model"
import { PriorityJobActions } from "./priority-job-actions"

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
  token,
  open,
  pulse,
  onOpen,
  onDismiss,
  prioritized,
  onPriorityToggle,
}: {
  it: FeedItem
  token: string
  open: boolean
  pulse?: JobPulse
  onOpen: () => void
  onDismiss: () => void
  prioritized: boolean
  onPriorityToggle: (prioritized: boolean) => void
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
      rail={<CardDetailRail token={token} jobId={it.jobId} job={job} />}
      actions={
        <PriorityJobActions
          token={token}
          jobId={it.jobId}
          job={job}
          prioritized={prioritized}
          onPriorityToggle={onPriorityToggle}
          onSkip={() => leaveThen(onDismiss)}
          onFindSimilar={() => leaveThen(onDismiss)}
          tailorHref={`/cv?jobId=${encodeURIComponent(it.jobId)}`}
        />
      }
    />
  )
}

/** A saved application (You added / Applied chips) — unsave + Tailor. */
export function CollectionRow({
  it,
  token,
  app,
  open,
  pulse,
  onOpen,
  onUnsave,
  onTailor,
  onOpenCv,
  onSnooze,
  onSaveNote,
  onPriorityToggle,
}: {
  it: FeedItem
  token: string
  app: ApplicationResponse | undefined
  open: boolean
  pulse?: JobPulse
  onOpen: () => void
  onUnsave: () => void
  onTailor: () => void
  onOpenCv: () => void
  onSnooze: () => void
  onSaveNote: (note: string) => void
  onPriorityToggle: (prioritized: boolean) => void
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
      rail={<CardDetailRail token={token} jobId={it.jobId} job={it.job} />}
      actions={
        !applied ? (
          <div className="db-card-actions" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className={`db-icon-btn${app?.is_priority ? " liked" : ""}`}
              aria-label={app?.is_priority ? "Remove job priority" : "Prioritize this job"}
              aria-pressed={app?.is_priority ?? false}
              title={app?.is_priority ? "Priority to apply" : "Prioritize to apply"}
              onClick={() => onPriorityToggle(!(app?.is_priority ?? false))}
            >
              <HeartGlyph />
            </button>
            <button
              type="button"
              className="db-icon-btn"
              aria-label="Remove from Collections"
              title="Remove from Collections"
              onClick={onUnsave}
            >
              <span aria-hidden>×</span>
            </button>
            <button type="button" className="db-btn db-btn-secondary tm-control-focus" onClick={() => setNoteOpen((open) => !open)}>
              Note
            </button>
            <button type="button" className="db-btn db-btn-secondary tm-control-focus" onClick={onSnooze}>
              Snooze 3d
            </button>
            {tailored ? (
              <button type="button" className="db-btn db-btn-secondary tm-control-focus" onClick={onOpenCv}>
                Tailored ✓
              </button>
            ) : (
              <button type="button" className="db-btn db-btn-primary tm-control-focus" onClick={onTailor}>
                Tailor CV
              </button>
            )}
          </div>
        ) : (
          <div className="db-card-actions" onClick={(event) => event.stopPropagation()}>
            <Link
              href={`/preparations/${encodeURIComponent(it.jobId)}`}
              className="db-btn db-btn-primary tm-control-focus"
              style={{ textDecoration: "none" }}
            >
              Prep room →
            </Link>
          </div>
        )
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

/** A dead listing — found, saved, or applied, doesn't matter which. Nothing
 *  actionable left on the listing itself (no unsave/tailor/apply), so the row
 *  trades those for the one thing worth doing next: the company that posted it
 *  is already auto-followed (backend sweep), so this is just a direct path to
 *  its live openings — the "similar roles from this company" ask. */
export function ClosedRow({
  it,
  app,
  open,
  onOpen,
}: {
  it: FeedItem
  app: ApplicationResponse | undefined
  open: boolean
  onOpen: () => void
}) {
  const origin = app ? (app.status !== "saved" ? "Applied" : isExtSource(app.source) ? "Extension" : isMyroSource(app.source) ? "Myro found" : "You added") : "Myro found"
  return (
    <FeedCard
      data={feedDataFromMatch({ jobId: it.jobId, company: it.company, role: it.role, job: it.job, fit: it.fit })}
      variant="row"
      open={open}
      extraClass=" fc-conf-closed"
      onOpen={onOpen}
      badges={<span className="db-sourcechip">{origin}</span>}
      pulse={
        <div className="tm-pulse">
          <span className="tm-pulse-item tm-pulse-warn">Closed listing</span>
        </div>
      }
      actions={
        it.company ? (
          <div className="db-card-actions" onClick={(e) => e.stopPropagation()}>
            <a
              href={companyHref(it.company)}
              target="_blank"
              rel="noopener noreferrer"
              className="db-btn db-btn-secondary tm-control-focus"
              style={{ textDecoration: "none" }}
            >
              More at {it.company} ↗
            </a>
          </div>
        ) : null
      }
    />
  )
}
