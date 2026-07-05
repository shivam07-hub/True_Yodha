/**
 * RestructureLoading — the perceived-speed loader for the ~15–20s whole-CV
 * Mentor restructure. Instead of a single frozen "…restructuring" line, it
 * narrates the real steps Mentor runs and fills a progress bar, so a long wait
 * reads as motion, not a hang. Shared by the authed + public restructure modals.
 *
 * Motion is compositor-only: the bar animates transform: scaleX (never width),
 * the active dot a small scale/opacity pulse. Both are gated by
 * prefers-reduced-motion in cv-builder.css. The step advance is content change,
 * not animation, and is announced via aria-live.
 */
"use client"

import { useEffect, useState } from "react"

// Honest steps — this is exactly what the restructure does (reorder, merge,
// tighten existing bullets; never invent). "Structure encodes truth."
const STEPS = [
  "Reading your CV",
  "Finding your strongest wins",
  "Reordering for impact",
  "Tightening every line",
  "Polishing the final draft",
] as const

const STEP_MS = 3600

export function RestructureLoading({ note }: { note?: string }) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => {
      setStep((prev) => Math.min(prev + 1, STEPS.length - 1))
    }, STEP_MS)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="cvb-rs-loading" role="status" aria-live="polite">
      <div className="cvb-rs-loading-track">
        <span className="cvb-rs-loading-fill" />
      </div>
      <div className="cvb-rs-loading-steps">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={`cvb-rs-loading-step${i === step ? " is-now" : ""}${i < step ? " is-done" : ""}`}
          >
            <span className="cvb-rs-loading-dot" aria-hidden />
            {label}
          </div>
        ))}
      </div>
      {note && <p className="cvb-rs-loading-note">{note}</p>}
    </div>
  )
}
