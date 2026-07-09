"use client"

import * as React from "react"
import "./capture-confirm.css"

/**
 * The in-card save confirmation (journey treatment B). Slides down inside the
 * Signal Card the moment a job is captured and answers the two Delta-4 questions
 * at the exact locus of action: WHERE it went (✓ In Collections · #N in queue)
 * and WHAT's next (Tailor now →) — plus Undo. This SUPERSEDES the old detached
 * "saved" toast on the feed: one undo affordance, in place, no "where did it go?".
 *
 * Compositor-only entrance (transform + opacity), reduced-motion aware.
 */
export interface CaptureConfirmProps {
  /** Position in the tailor queue, if known (rendered as "#3 in queue"). */
  queuePosition?: number
  onTailor: () => void
  onUndo: () => void
}

export function CaptureConfirm({ queuePosition, onTailor, onUndo }: CaptureConfirmProps) {
  return (
    <div className="tm-capconfirm" role="status" aria-live="polite">
      <span className="tm-capconfirm-lead">
        <Check aria-hidden /> In Collections
        {queuePosition ? <span className="tm-capconfirm-pos">· #{queuePosition} in queue</span> : null}
      </span>
      <button
        type="button"
        className="tm-capconfirm-tailor"
        onClick={(e) => {
          e.stopPropagation()
          onTailor()
        }}
      >
        Tailor now <span aria-hidden>→</span>
      </button>
      <button
        type="button"
        className="tm-capconfirm-undo"
        onClick={(e) => {
          e.stopPropagation()
          onUndo()
        }}
      >
        Undo
      </button>
    </div>
  )
}

function Check(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M4 12.5l5 5L20 7" />
    </svg>
  )
}
