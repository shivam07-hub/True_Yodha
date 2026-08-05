"use client"

/**
 * The scoring state on /cv-preview. A logged-out user just dropped a CV and
 * jumped here; this is the wait while the real engine scores it.
 *
 * This file used to own a whole parallel loading surface, and it narrated that
 * surface from a `setInterval` — three stages ticking themselves off every
 * 1400ms whether or not any of them had happened. That is the same fabricated
 * progress that was removed from the authed upload in db89a3f4; it survived
 * here because the two surfaces shared no code.
 *
 * It now renders the shared `CvAnalysisStage` in its `request` shape: the
 * preview is ONE blocking POST, so the client can honestly say a document is
 * being read and nothing finer. Page chrome (the section eyebrow) stays here;
 * the wait itself is the same object the authed app shows.
 */

import { CvAnalysisStage } from "@/components/cv/analysis-stage"
import "@/components/public/landing/sample-readout.css"
import "./scoring-console.css"

export function ScoringConsole() {
  return (
    <div className="sc-wrap">
      <div className="sr-head">
        <span className="sr-eyebrow">Scoring</span>
      </div>
      <CvAnalysisStage kind="request" />
    </div>
  )
}
