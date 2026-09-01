"use client"

import * as React from "react"
import Link from "next/link"
import "./cv-score-progress.css"
import { CvAnalysisStage } from "./analysis-stage"
import { tierForScore } from "@/lib/score-tiers"
import type { CVUploadPhase } from "@/lib/cv-upload-state"
import { revealVerdict } from "@/lib/cv/upload-progress"

/**
 * The CV-upload outcome on /cv: the score reveal and the failure state.
 *
 * The RUNNING state is no longer implemented here — it is `CvAnalysisStage`,
 * the one wait surface shared with onboarding and the logged-out preview. What
 * belongs to this file is what only happens here: the score ring morph, the
 * reveal beat, and a per-error failure with its refund receipt.
 *
 * Truthful phases, a live elapsed counter (NO fabricated estimate), and no
 * "20-30 seconds" clock — the done-morph is the proof, not reassurance copy.
 */

type Phase = CVUploadPhase

interface DoneData {
  score: number
  skillsDetected: number
  /** Lowest-scoring domain for the single Improve action (#6 Q4). Optional —
   *  the status payload has no breakdown, so the caller reads the scores cache. */
  biggestDragDomain?: string | null
  /** Download-master CTA (Q7 — download is the primary action at the score
   *  reveal). Owned by the caller, which holds token + baseline + cv. */
  downloadSlot?: React.ReactNode
  /** The reveal beat (#34 S4, Q9-A). Computed by the caller from the parsed CV:
   *  a band verdict, the real COUNT of fixes we found (no fabricated point delta —
   *  content fixes move the per-job Ready, not this engine score), and the
   *  strongest / weakest domain. Omit to keep the lean done-morph. */
  reveal?: {
    fixCount: number
    strongDomain?: string | null
    weakDomain?: string | null
  }
  /** True when this user has scored a CV but has never named a target role.
   *
   *  /cv is the workstation: it takes an upload, scores it, and stops. The
   *  anonymous-CV route lands here straight from signup (postAuthDestination
   *  Exception 1), so the product's highest-intent traffic used to reach a score
   *  and no target — and a target roughly triples apply rate (26% with, 9%
   *  without). When this is set, the next spine step becomes the primary action
   *  instead of a fix list, because there is nothing to aim the fixes at yet. */
  needsTarget?: boolean
}

interface FailData {
  errorCode: string | null
  detail: string
  xpRefunded: boolean
}

interface CvScoreProgressProps {
  /** "processing" while polling, "done"/"failed" terminal. */
  status: "processing" | "done" | "failed"
  phase: Phase | null
  /** ISO timestamp the job started — anchors the live elapsed counter. */
  startedAt: string | null
  done?: DoneData | null
  fail?: FailData | null
  onRetry?: () => void
}

export function CvScoreProgress({ status, phase, startedAt, done, fail, onRetry }: CvScoreProgressProps) {
  if (status === "failed" && fail) {
    return (
      <div className="csp csp--failed" role="alert">
        <div className="csp-fail-icon" aria-hidden>✕</div>
        <div className="csp-fail-body">
          <div className="csp-fail-title">Couldn’t finish analysing your CV</div>
          <p className="csp-fail-detail">{fail.detail}</p>
          {fail.xpRefunded ? <div className="csp-fail-refund">Myro Coins refunded</div> : null}
        </div>
        {onRetry ? (
          <button type="button" className="csp-retry tm-control-focus" onClick={onRetry}>
            Try again
          </button>
        ) : null}
      </div>
    )
  }

  if (status === "done" && done) {
    const tier = tierForScore(done.score)
    return (
      <div className="csp csp--done">
        <div className="csp-ring" data-score={done.score}>
          <span className="csp-ring-num">{done.score}</span>
        </div>
        <div className="csp-done-tier">{tier.label}</div>
        {done.reveal ? (
          <p className="csp-done-verdict">{revealVerdict(done.score)}</p>
        ) : tier.next !== null ? (
          <div className="csp-done-next">
            Next milestone: <strong>{tier.next}</strong> · {tier.nextLabel}
          </div>
        ) : null}

        {done.reveal && (done.reveal.strongDomain || done.reveal.weakDomain) ? (
          <div className="csp-done-swx">
            {done.reveal.strongDomain ? (
              <span className="csp-done-sw is-strong">Strongest · {done.reveal.strongDomain}</span>
            ) : null}
            {done.reveal.weakDomain ? (
              <span className="csp-done-sw is-weak">Needs work · {done.reveal.weakDomain}</span>
            ) : null}
          </div>
        ) : null}

        <Link href="/docs#scoring" className="csp-done-method tm-control-focus">
          How this score works
        </Link>

        {/* The spine is CV → score → target → feed. The score has just landed, so
            the next step is the target, and it outranks the fix list: fixes are
            measured against a role the user has not picked yet. Same door as
            every other "you have not started yet" action in the product. */}
        {done.needsTarget ? (
          <div className="csp-done-actions">
            {done.downloadSlot}
            <Link href="/onboarding" className="csp-done-cta tm-control-focus">
              Pick your target role →
            </Link>
          </div>
        ) : done.reveal ? (
          <div className="csp-done-actions">
            {done.downloadSlot}
            <Link href="/cv" className="csp-done-cta tm-control-focus">
              {done.reveal.fixCount > 0
                ? `See your ${done.reveal.fixCount} fix${done.reveal.fixCount === 1 ? "" : "es"} →`
                : "Open your CV →"}
            </Link>
          </div>
        ) : done.downloadSlot ? (
          <div className="csp-done-actions">
            {done.downloadSlot}
            <Link href="/practice" className="csp-done-cta-secondary tm-control-focus">
              See your next 3 steps →
            </Link>
          </div>
        ) : (
          <Link href="/practice" className="csp-done-cta tm-control-focus">
            See your next 3 steps →
          </Link>
        )}
      </div>
    )
  }

  // Processing — the shared wait, then the real-shape skeleton of the score card
  // this surface (and only this surface) is about to fill. The skeleton mirrors
  // `.csp--done` exactly, so the result does not replace it: the ring is already
  // in position when the score lands, and only its weight and number change.
  return (
    <div className="csp csp--running">
      <CvAnalysisStage kind="job" phase={phase} startedAt={startedAt} onRetry={onRetry} />
      <div className="csp-skeleton" aria-hidden>
        <div className="csp-sk-ring" />
        <div className="csp-sk-lines">
          <span className="tm-skeleton" />
          <span className="tm-skeleton" />
          <span className="tm-skeleton" />
        </div>
      </div>
    </div>
  )
}
