"use client"

import * as React from "react"
import Link from "next/link"
import { Heart, X } from "lucide-react"
import { FeedCard, feedCardConfidenceClass } from "@/components/jobs/feed-card"
import { CardDetailRail } from "@/components/jobs/card-detail-rail"
import { feedDataFromMatch } from "@/lib/jobs/card-view"
import { PulseRow } from "@/components/dashboard/card-atoms"
import { LegitimacyBadge } from "@/components/jobs/match-brain"
import { companyHref } from "@/components/companies/company-link"
import { ApplyCapturePrompt } from "@/components/jobs/apply-capture-prompt"
import { useApplyCapture } from "@/components/jobs/use-apply-capture"
import { ORIGIN_LABEL, heroFor } from "@/lib/collections/model"
import type { CollectionEntry, JobPulse } from "@/lib/api"

/* ── ONE row, staged chrome (CONTEXT.md → Collection Record) ──────────────────
 * There used to be three row components — MyroFoundRow, CollectionRow, ClosedRow
 * — with three different action sets, two different meanings for the same ×, and
 * a brain grade printed beside the ring on one of them. A card is a decision
 * instrument: the slots are
 * identical everywhere and the STAGE changes only the hero verb and which quiet
 * controls are present. Origin is a chip, never a second template.
 * ────────────────────────────────────────────────────────────────────────── */

export interface CollectionRowActions {
  onOpen: () => void
  /** Remove from this list. ONE meaning at every stage, always undoable. */
  onRemove: () => void
  onPriorityToggle: (prioritized: boolean) => void
  onSaveNote: (note: string) => void
  /** Answer the unanswered apply click — "did you actually submit?". */
  onAnswerPending?: (submitted: boolean) => void
}

export function CollectionRow({
  entry,
  token,
  open,
  pulse,
  /** Picks open their Why panel — the reason Myro chose it is the point of the
   *  band, so it must not be one more click behind a closed rail. */
  openWhy = false,
  actions,
}: {
  entry: CollectionEntry
  token: string
  open: boolean
  pulse?: JobPulse
  openWhy?: boolean
  actions: CollectionRowActions
}) {
  const [noteOpen, setNoteOpen] = React.useState(false)
  const [note, setNote] = React.useState(entry.notes ?? "")
  const [leaving, setLeaving] = React.useState(false)
  const hero = heroFor(entry)
  const job = entry.job
  // The heart is priority AFTER claim. On an unclaimed `found` row it would be
  // a second save control wearing a different glyph, next to a hero that
  // already claims the job.
  const canPrioritize = entry.stage !== "found" && entry.stage !== "closed"
  const canRemove = entry.stage !== "applied"

  const capture = useApplyCapture({
    token,
    job: {
      job_id: entry.job_id,
      source_url: job.source_url,
      company: job.company,
      listing_confidence: entry.liveness === "down" ? "closed" : entry.liveness === "live" ? "active" : "uncertain",
    },
    surface: "dashboard",
    intentSurface: "collections",
  })

  const removeThen = () => {
    setLeaving(true)
    window.setTimeout(actions.onRemove, 230)
  }

  return (
    <div>
      <FeedCard
        data={feedDataFromMatch({ jobId: entry.job_id, company: job.company, role: job.title, job, fit: job.match_score })}
        variant="row"
        open={open}
        leaving={leaving}
        extraClass={feedCardConfidenceClass(pulse) || (entry.liveness === "down" ? " fc-conf-closed" : "")}
        onOpen={actions.onOpen}
        badges={
          <>
            {/* Origin is a LABEL. It never decides which list this is in. */}
            <span className="db-sourcechip">{ORIGIN_LABEL[entry.origin]}</span>
            {entry.stage === "applied" && entry.status && entry.status !== "applied" ? (
              <span className="db-statuschip">{STATUS_WORD[entry.status] ?? entry.status}</span>
            ) : null}
            {/* Grade is NOT here. It is a second "how good" beside the ring —
                the same collision the Jobs face locked out. It lives in Why. */}
            <LegitimacyBadge tier={job.legitimacy_tier} reason={job.legitimacy_reason} />
          </>
        }
        pulse={<PulseRow pulse={pulse} />}
        rail={<CardDetailRail token={token} jobId={entry.job_id} job={job} defaultTab={openWhy ? "why" : undefined} />}
        actions={
          <div className="db-job-intent-group">
            <div className="db-card-actions" onClick={(event) => event.stopPropagation()}>
              {canPrioritize ? (
                <button
                  type="button"
                  className={`db-icon-btn${entry.is_priority ? " liked" : ""}`}
                  aria-label={entry.is_priority ? "Remove job priority" : "Prioritize this job"}
                  aria-pressed={entry.is_priority}
                  title={entry.is_priority ? "Priority to apply" : "Prioritize to apply"}
                  onClick={() => actions.onPriorityToggle(!entry.is_priority)}
                >
                  <Heart size={16} fill={entry.is_priority ? "currentColor" : "none"} aria-hidden />
                </button>
              ) : null}
              {canRemove ? (
                <button
                  type="button"
                  className="db-icon-btn tm-dismiss-action"
                  aria-label="Remove from Collections"
                  title="Remove from Collections"
                  onClick={removeThen}
                >
                  <X size={16} aria-hidden />
                </button>
              ) : null}
              {entry.stage === "saved" || entry.stage === "tailored" ? (
                <button type="button" className="db-btn db-btn-secondary tm-control-focus" onClick={() => setNoteOpen((v) => !v)}>
                  Note
                </button>
              ) : null}

              {/* THE hero — exactly one, chosen by stage. */}
              {hero.href ? (
                <Link
                  href={hero.href}
                  className={`db-btn tm-control-focus ${hero.kind === "gap" ? "db-btn-secondary" : "db-btn-primary"}`}
                  style={{ textDecoration: "none" }}
                >
                  {hero.label}
                </Link>
              ) : (
                <a
                  href={job.company ? companyHref(job.company) : "/market"}
                  target={job.company ? "_blank" : undefined}
                  rel={job.company ? "noopener noreferrer" : undefined}
                  className="db-btn db-btn-secondary tm-control-focus"
                  style={{ textDecoration: "none" }}
                >
                  {hero.label} ↗
                </a>
              )}

              {/* Apply Transport. Not a peer of the hero — it is the handoff
                  control, and it is absent once the listing is down. */}
              {entry.liveness !== "down" && capture.target.url && capture.target.actionLabel ? (
                <a
                  className="db-btn db-btn-secondary tm-control-focus"
                  href={capture.href ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={capture.onApply}
                  title={capture.target.actionLabel}
                >
                  {capture.target.actionLabel}
                </a>
              ) : null}
            </div>
            <ApplyCapturePrompt capture={capture} />
            {/* The ask the 1.2s inline band never got to make: they left for the
                ATS and came back to a card that had moved on. */}
            {entry.pending_apply && actions.onAnswerPending ? (
              <div className="db-pending-apply" role="status">
                <span>You opened this application. Did you submit it?</span>
                <button type="button" className="db-btn db-btn-primary tm-control-focus" onClick={() => actions.onAnswerPending?.(true)}>
                  Yes, applied
                </button>
                <button type="button" className="db-btn db-btn-secondary tm-control-focus" onClick={() => actions.onAnswerPending?.(false)}>
                  Not yet
                </button>
              </div>
            ) : null}
          </div>
        }
      />
      {noteOpen ? (
        <textarea
          aria-label={`Note for ${job.title}`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => actions.onSaveNote(note)}
          placeholder="Why this role is worth applying to…"
          rows={2}
          style={{ width: "100%", marginTop: 8, padding: "9px 10px", borderRadius: 8, border: "1px solid var(--tm-border)", background: "var(--tm-surface-2)", color: "var(--tm-text)", resize: "vertical" }}
        />
      ) : null}
    </div>
  )
}

/** The post-apply words. `stage` is `applied` for all of them — this names WHICH
 *  outcome, which the old folder could not say at all: rejected, ghosted and
 *  offer all rendered as an undifferentiated "Applied". */
const STATUS_WORD: Record<string, string> = {
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  ghosted: "No reply",
}
