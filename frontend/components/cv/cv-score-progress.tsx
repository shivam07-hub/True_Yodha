"use client"

import * as React from "react"
import Link from "next/link"
import "./cv-score-progress.css"
import { tierForScore } from "@/lib/score-tiers"
import type { CVUploadPhase } from "@/lib/cv-upload-state"
import {
  currentPhaseLabel,
  elapsedSeconds,
  formatElapsed,
  isSlow,
  revealVerdict,
} from "@/lib/cv/upload-progress"

/**
 * #6 — deploy-style CV-upload progress (GitHub/Vercel deploy log analog).
 * Shared by the Replace-Main-CV modal and onboarding. Truthful phases, a
 * live-elapsed counter (NO fabricated estimate), a real-shape skeleton, an
 * inline done-morph (no redirect), and a per-error failure state. No lying
 * "20-30 seconds" clock, no reassurance microcopy (the done-morph proves it).
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

function useElapsed(startedAt: string | null, active: boolean): number {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return elapsedSeconds(startedAt, now)
}

export function CvScoreProgress({ status, phase, startedAt, done, fail, onRetry }: CvScoreProgressProps) {
  const processing = status === "processing"
  const elapsed = useElapsed(startedAt, processing)
  const slow = processing && isSlow(elapsed)

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

        {/* Reveal CTA points at the report (the fixes live in /cv); the count is
            the real number of findings, never a fabricated point promise. */}
        {done.reveal ? (
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
            <Link href="/forge" className="csp-done-cta-secondary tm-control-focus">
              See your next 3 steps →
            </Link>
          </div>
        ) : (
          <Link href="/forge" className="csp-done-cta tm-control-focus">
            See your next 3 steps →
          </Link>
        )}
      </div>
    )
  }

  // Processing — one persisted server phase, never a timed story about work that
  // may not be happening. Elapsed time proves liveness without estimating an end.
  return (
    <div className="csp csp--running" aria-busy="true">
      <ol className="csp-steps" aria-live="polite">
        <li className="csp-step is-active">
          <span className="csp-step-dot" aria-hidden />
          <span className="csp-step-label">{currentPhaseLabel(phase)}</span>
          {/* aria-hidden: a per-second announcement is hostile to screen readers. */}
          <span className="csp-step-time" aria-hidden>{formatElapsed(elapsed)}</span>
          {slow ? (
            <span className="csp-step-note">Still working — this is taking longer than usual.</span>
          ) : null}
        </li>
      </ol>

      {/* Real-shape skeleton of the score card that's coming — the terminus of
          the rail, not an appended card (rule 4). Canonical `.tm-skeleton`
          sweep (ADR-0011 §B) instead of a hand-rolled per-element pulse. */}
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
