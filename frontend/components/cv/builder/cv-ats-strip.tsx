/**
 * CvAtsStrip — every PASSING machine-readability check, collapsed into one line.
 *
 * Handoff §4.5. The old ATS tab listed all ten checks at equal weight, so the
 * two that were failing sat among eight that were fine, and on the anon surface
 * the whole tab was read-only. Failures now live in the queue as actionable
 * rows; what is left here is a receipt, and a receipt is one line until asked.
 */
"use client"

import { useState } from "react"
import type { AtsCheck } from "./ats-checks"

interface CvAtsStripProps {
  checks: AtsCheck[]
  passed: number
}

export function CvAtsStrip({ checks, passed }: CvAtsStripProps) {
  const [open, setOpen] = useState(false)
  if (passed === 0) return null
  const passing = checks.filter(c => c.pass)
  return (
    <div className="cvw-ats">
      <button
        type="button"
        className="cvw-ats-head"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span className="cvw-ats-title">✓ {passed} ATS checks pass</span>
        <span className="cvw-ats-more">see all {open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="cvw-ats-list">
          {passing.map(c => <span key={c.label}>✓ {c.label}</span>)}
        </div>
      )}
    </div>
  )
}
