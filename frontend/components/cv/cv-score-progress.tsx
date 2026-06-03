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

const STEPS: ReadonlyArray<{ key: Phase; label: string }> = [
  { key: "reading", label: "Reading your CV" },
  { key: "scoring", label: "Scoring your domains" },
  { key: "ready", label: "Ready" },
]

// Phase ordinal for "done / active / pending" step states.
const ORDINAL: Record<Phase, number> = { queued: 0, reading: 1, scoring: 2, ready: 3, failed: 1 }
const SLOW_AFTER_MS = 75_000

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

  if (status === "failed" && fail) {
    return (
      <div className="csp csp--failed" role="alert">
        <div className="csp-fail-icon" aria-hidden>✕</div>
        <div className="csp-fail-body">
          <div className="csp-fail-title">Couldn’t finish analysing your CV</div>
          <p className="csp-fail-detail">{fail.detail}</p>
          {fail.xpRefunded ? <div className="csp-fail-refund">XP refunded</div> : null}
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
        {tier.next !== null ? (
          <div className="csp-done-next">
            Next milestone: <strong>{tier.next}</strong> · {tier.nextLabel}
          </div>
        ) : null}
        <Link href="/docs#scoring" className="csp-done-method tm-control-focus">
          How this score works
        </Link>
        {done.downloadSlot ? (
          <div className="csp-done-actions">
            {done.downloadSlot}
            <Link
              href={done.biggestDragDomain ? `/forge?view=map&domain=${encodeURIComponent(done.biggestDragDomain)}` : "/forge"}
              className="csp-done-cta-secondary tm-control-focus"
            >
              {done.biggestDragDomain ? `Improve ${done.biggestDragDomain} →` : "See your full breakdown →"}
            </Link>
          </div>
        ) : (
          <Link
            href={done.biggestDragDomain ? `/forge?view=map&domain=${encodeURIComponent(done.biggestDragDomain)}` : "/forge"}
            className="csp-done-cta tm-control-focus"
          >
            {done.biggestDragDomain ? `Improve ${done.biggestDragDomain} →` : "See your full breakdown →"}
          </Link>
        )}
      </div>
    )
  }

  // Processing — deploy-style phase log + real-shape skeleton.
  // `queued` is a real multi-second window (phase-1 upload/extract/charge +
  // pre-worker gap) but has no step of its own → showing it as ordinal 0 left
  // every step "pending": three dead circles, no spinner, looks frozen. We are
  // already reading the accepted CV, so collapse queued/null into the first
  // step active — the deploy log never shows an inert list.
  const current: Phase = phase && phase !== "queued" ? phase : "reading"
  const currentOrd = ORDINAL[current]
  return (
    <div className="csp csp--running" aria-live="polite" aria-busy="true">
      <ol className="csp-steps">
        {STEPS.map((step) => {
          const ord = ORDINAL[step.key]
          const state = ord < currentOrd ? "done" : ord === currentOrd ? "active" : "pending"
          return (
            <li key={step.key} className={`csp-step is-${state}`}>
              <span className="csp-step-dot" aria-hidden />
              <span className="csp-step-label">{step.label}</span>
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
