/**
 * CvFixBrief — what is wrong, why it costs, and what good looks like. Free.
 *
 * This is the layer the workstation was missing. Every path from "this line is
 * flagged" to "here is what is wrong with it" used to run through a Mentor call:
 * clicking a row started an LLM, a four-stage loader, and a wait — to learn
 * something the product already knew, deterministically, for nothing.
 *
 * Everything here is authored and static (content-check-explainers). It renders
 * synchronously, costs no coin, and reaches no network. The rewrite button is
 * INSIDE it, so generation is a second, deliberate act the user takes after they
 * understand the problem — and often decides they do not need, because the
 * example is usually enough to fix the line themselves.
 *
 * Resume Worded teardown pattern 9 ("teach while fixing") + pattern 10's honesty
 * about editing by hand. Grill-locked as Q6 = C on 2026-07-05.
 */
"use client"

import type { IssueBrief } from "./issue-model"
import type { Severity } from "./cv-severity"

interface CvFixBriefProps {
  brief: IssueBrief
  severity: Severity
  /** Primary. Absent for ATS/section rows, which have nothing to rewrite. */
  onRewrite?: () => void
  /** Type the fix yourself — for a weak opener or a cliché this is usually a
   *  two-word change, and it is instant and free where the model is neither. */
  onEdit?: () => void
  onDismiss?: () => void
  /** Rail context: the fix happens on the paper, so the rail sends you there. */
  onJump?: () => void
}

export function CvFixBrief({
  brief, severity, onRewrite, onEdit, onDismiss, onJump,
}: CvFixBriefProps) {
  return (
    <div className="cvw-brief" data-sev={severity}>
      {brief.reasons.length > 0 && (
        <ul className="cvw-brief-why">
          {brief.reasons.map(r => <li key={r}>{r}</li>)}
        </ul>
      )}

      {/* Labelled as a specimen, not an instruction. "instead of" reads as a
          claim ABOUT the line two rows above it, so the reader looks for it in
          their CV and cannot find it — which is exactly what happened. An
          eyebrow plus weak/strong says "this is what the defect looks like",
          which is what it always was. */}
      {brief.example && (
        <figure className="cvw-brief-eg">
          <figcaption className="cvw-brief-eg-head">Example</figcaption>
          <p className="cvw-brief-eg-row is-before">
            <span className="cvw-brief-eg-tag">weak</span>
            <span>{brief.example.before}</span>
          </p>
          <p className="cvw-brief-eg-row is-after">
            <span className="cvw-brief-eg-tag">strong</span>
            <span>{brief.example.after}</span>
          </p>
        </figure>
      )}

      <div className="cvw-brief-acts">
        {onJump && (
          <button type="button" className="cvw-rw-primary" onClick={onJump}>
            Fix this line
          </button>
        )}
        {onRewrite && (
          <button
            type="button"
            className={onJump ? "cvw-rw-ghost" : "cvw-rw-primary"}
            onClick={onRewrite}
          >Rewrite with Mentor</button>
        )}
        {onEdit && (
          <button type="button" className="cvw-rw-ghost" onClick={onEdit}>Edit it myself</button>
        )}
        {onDismiss && (
          <button type="button" className="cvw-rw-discard" onClick={onDismiss}>
            Not for this line
          </button>
        )}
      </div>
    </div>
  )
}
