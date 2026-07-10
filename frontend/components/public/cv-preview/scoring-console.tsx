"use client"

/**
 * The scoring state on /cv-preview (navigate-then-load). A logged-out user just
 * dropped a CV and jumped here; this is the few seconds while the real engine
 * scores it. Not a generic spinner — the product's signature moment is "the
 * Engine reads YOUR CV", so it renders as the dark Engine console (reusing the
 * .lp-readout-standalone token scope) shaped like the readout it becomes: a
 * scan sweep over a CV-skeleton + the three real compute stages ticking.
 */

import { useEffect, useState } from "react"
import "@/components/public/landing/sample-readout.css"
import "./scoring-console.css"

const STAGES = [
  "Reading your CV",
  "Mapping skills to live demand",
  "Scoring across 10 domains",
]

export function ScoringConsole() {
  const [active, setActive] = useState(0)
  // Elapsed seconds — turns a slow tail into "thorough" rather than "frozen".
  // The real score has no progress events, so once the stages are lit the
  // indeterminate bar carries motion and this line reassures after a few sec.
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setActive(STAGES.length - 1)
      return
    }
    const stage = window.setInterval(
      () => setActive((a) => Math.min(a + 1, STAGES.length - 1)),
      1400,
    )
    const tick = window.setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => {
      window.clearInterval(stage)
      window.clearInterval(tick)
    }
  }, [])

  return (
    <div className="lp-readout-standalone sc-wrap">
      <div className="sr-head">
        <span className="sr-eyebrow">Scoring</span>
        <h2 className="sr-title">The Engine is reading your CV.</h2>
      </div>

      <div className="lp-readout-card sc-card" role="status" aria-live="polite" aria-busy="true">
        <div className="sc-doc" aria-hidden>
          <span className="sc-line w90" />
          <span className="sc-line w70" />
          <span className="sc-line w80" />
          <span className="sc-line w55" />
          <span className="sc-line w75" />
          <span className="sc-scan" />
        </div>

        <ol className="sc-stages">
          {STAGES.map((label, i) => (
            <li
              key={label}
              className={`sc-stage${i < active ? " is-done" : ""}${i === active ? " is-active" : ""}`}
            >
              <span className="sc-dot" aria-hidden />
              <span className="sc-label">{label}</span>
            </li>
          ))}
        </ol>

        {/* Indeterminate bar — always in motion, so the wait never reads as
            frozen no matter how long the real score takes. */}
        <div className="sc-bar" aria-hidden>
          <span className="sc-bar-fill" />
        </div>
      </div>

      {elapsed >= 6 && (
        <p className="sc-foot">
          Still scoring — a thorough read of your CV takes a few seconds.
        </p>
      )}
    </div>
  )
}
