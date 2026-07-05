"use client"

import * as React from "react"
import Link from "next/link"
import "./cv-score-progress.css"
import { tierForScore } from "@/lib/score-tiers"
import type { CVUploadPhase } from "@/lib/cv-upload-state"

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

/** Band verdict for the reveal beat — leads with the path forward, never a
 *  judgement (ND1). Derived from the engine score alone. */
function revealVerdict(score: number): string {
  if (score >= 80) return "Strong CV. A few sharpens and it’s recruiter-ready."
  if (score >= 60) return "Solid base — a handful of fixes will make it land harder."
  if (score >= 40) return "Good raw material. The fixes below are where the points are."
  return "Early draft — let’s turn what you’ve done into what a recruiter reads."
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

// Truthful parse substeps (#34 S4, Q8-B) — the pipeline genuinely reads → finds
// experience → matches skills → scores. Narrating them (vs one coarse "Scoring")
// makes the wait read as "it's reading MY CV", the RW trust cue. The first four
// advance on a timed cadence (the blessed restructure-loading pattern); the list
// snaps to the last step the instant the real `ready` phase lands, so the timer
// never outruns or lags the truth.
const PARSE_STEPS: readonly string[] = [
  "Reading your CV",
  "Finding your experience",
  "Matching your skills",
  "Scoring your domains",
]
const SUBSTEP_MS = 2600
const SLOW_AFTER_MS = 75_000

function useParseStep(active: boolean, atReady: boolean): number {
  const [i, setI] = React.useState(0)
  React.useEffect(() => {
    if (!active || atReady) return
    const id = setInterval(() => setI((p) => Math.min(p + 1, PARSE_STEPS.length - 1)), SUBSTEP_MS)
    return () => clearInterval(id)
  }, [active, atReady])
  return atReady ? PARSE_STEPS.length - 1 : i
}

function useElapsed(startedAt: string | null, active: boolean): number {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  if (!startedAt) return 0
  const start = new Date(startedAt).getTime()
  if (Number.isNaN(start)) return 0
  return Math.max(0, Math.floor((now - start) / 1000))
}

function fmt(s: number): string {
  const m = Math.floor(s / 60)
  const r = s % 60
  return m > 0 ? `${m}m ${r}s` : `${r}s`
}

export function CvScoreProgress({ status, phase, startedAt, done, fail, onRetry }: CvScoreProgressProps) {
  const processing = status === "processing"
  const elapsed = useElapsed(startedAt, processing)
  const slow = processing && elapsed >= SLOW_AFTER_MS
  const parseStep = useParseStep(processing, phase === "ready")

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

  // Processing — narrated parse substeps (#34 S4) + real-shape skeleton. The
  // active step advances on a timed cadence and snaps to the last step when the
  // real `ready` phase lands, so the list never shows an inert set of circles.
  return (
    <div className="csp csp--running" aria-live="polite" aria-busy="true">
      <ol className="csp-steps">
        {PARSE_STEPS.map((label, i) => {
          const state = i < parseStep ? "done" : i === parseStep ? "active" : "pending"
          return (
            <li key={label} className={`csp-step is-${state}`}>
              <span className="csp-step-dot" aria-hidden />
              <span className="csp-step-label">{label}</span>
              {state === "active" ? <span className="csp-step-spin" aria-hidden /> : null}
            </li>
          )
        })}
      </ol>

      {/* Real-shape skeleton of the score card that's coming. */}
      <div className="csp-skeleton" aria-hidden>
        <div className="csp-sk-ring" />
        <div className="csp-sk-lines">
          <span /><span /><span />
        </div>
      </div>

      <div className="csp-foot">
        <span className="csp-elapsed">{fmt(elapsed)}</span>
        {slow ? (
          <span className="csp-slow">Still ranking — busy moment on our side.</span>
        ) : null}
      </div>
    </div>
  )
}
