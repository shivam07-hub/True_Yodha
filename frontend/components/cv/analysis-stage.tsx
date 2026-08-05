"use client"

import * as React from "react"
import "./analysis-stage.css"

import type { CVUploadPhase } from "@/lib/cv-upload-state"
import {
  analysisView,
  elapsedSeconds,
  formatElapsed,
  type AnalysisKind,
} from "@/lib/cv/upload-progress"

/**
 * The CV-analysis wait. One component, every surface that shows it.
 *
 * There were three: a branded console on the logged-out /cv-preview, a centred
 * spinner in onboarding, and a deploy-style rail on the authed /cv. Three
 * visual languages, three copy sets and four "slow" thresholds for one piece of
 * work — and the richest of the three was the one narrating from a timer while
 * the two with a real server phase stream rendered a single line.
 *
 * Two shapes of truth, one surface:
 *   `job`     — a durable upload job. Each step is a persisted worker phase.
 *   `request` — the logged-out preview's single blocking POST. One honest step,
 *               because one round trip is all the client can observe.
 *
 * Nothing here advances on a timer. The only clock is elapsed time, which is a
 * fact about the user's wait rather than a claim about Myro's progress.
 */

interface AnalysisStageProps {
  kind: AnalysisKind
  /** Persisted worker phase. Ignored when `kind` is "request". */
  phase?: CVUploadPhase | null
  /** ISO job-creation time, so the counter survives a reload mid-analysis.
   *  Omitted (the preview) counts from mount, which is when its request began. */
  startedAt?: string | null
  /** Escape hatch. Every surface should offer one; the longest waits are the
   *  ones where leaving and coming back is the right answer. */
  actions?: React.ReactNode
  /** Re-poll now. Rendered ONLY once stalled — "check again" from second one
   *  invites people to hammer a job that is running perfectly, and it is an
   *  admission the screen might be wrong, which it usually is not. The stall
   *  clock lives here, so the decision does too. */
  onRetry?: () => void
  /** Heading level. The preview page already owns an h1, onboarding does not. */
  as?: "h1" | "h2"
}

/** Ticks once a second while `active`. One timer for the whole surface. */
function useNow(active: boolean): number {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(id)
  }, [active])
  return now
}

export function CvAnalysisStage({
  kind, phase = null, startedAt = null, actions, onRetry, as: Heading = "h2",
}: AnalysisStageProps) {
  const now = useNow(true)

  // Mount time anchors the counter when no job timestamp exists, and anchors the
  // stall clock whenever the phase last changed. A ref, not state: writing it
  // during render would re-enter, and it is never itself rendered.
  const mountedAt = React.useRef(new Date().toISOString())
  const phaseSince = React.useRef(mountedAt.current)
  const lastPhase = React.useRef<CVUploadPhase | null>(phase)
  if (lastPhase.current !== phase) {
    lastPhase.current = phase
    phaseSince.current = new Date().toISOString()
  }

  const total = elapsedSeconds(startedAt ?? mountedAt.current, now)
  // The stall clock measures the CURRENT phase. A job whose total is 120s but
  // which advanced 4s ago is healthy; one sitting 120s on the same phase is not,
  // and only the second of those is worth interrupting someone about.
  const secondsInPhase = kind === "job" ? elapsedSeconds(phaseSince.current, now) : total
  const view = analysisView({ kind, phase, secondsInPhase })

  return (
    <section className="cva" role="status" aria-live="polite" aria-busy={!view.stalled}>
      <Heading className="cva-headline">{view.headline}</Heading>

      {/* The CV being read, with an accent line sweeping it. The one ambient
          animation on screen — it says "a document is being worked on" without
          claiming anything about how far along that work is. */}
      <div className="cva-doc" aria-hidden>
        <span className="cva-line w90" />
        <span className="cva-line w70" />
        <span className="cva-line w80" />
        <span className="cva-line w55" />
        <span className="cva-line w75" />
        {!view.stalled && <span className="cva-scan" />}
      </div>

      <ol className="cva-steps">
        {view.steps.map((step) => (
          <li key={step.label} className={`cva-step is-${step.state}`}>
            <span className="cva-dot" aria-hidden />
            <span className="cva-label">{step.label}</span>
            {step.state === "active" && (
              // aria-hidden: a per-second announcement is hostile to screen
              // readers, and the elapsed time is not needed to follow the state.
              <span className="cva-time" aria-hidden>{formatElapsed(total)}</span>
            )}
          </li>
        ))}
      </ol>

      {view.note && <p className="cva-note">{view.note}</p>}

      {(actions || (onRetry && view.stalled)) && (
        <div className="cva-actions">
          {onRetry && view.stalled && (
            <button type="button" className="cva-retry tm-control-focus" onClick={onRetry}>
              Check again
            </button>
          )}
          {actions}
        </div>
      )}
    </section>
  )
}
