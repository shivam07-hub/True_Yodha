/**
 * Phone triage (handoff 1f) — the two pieces the rail turns into on a phone.
 *
 * · CvSeverityChips  the triage numerals, as a scrolling chip row under the
 *                    header. Three 24px tiles do not fit at 375px, and a 3px
 *                    gutter is doing less work at that size, so severity has to
 *                    be legible in words here.
 * · CvDoNowBar       rank 1, pinned to the bottom with a 48px-min primary. On
 *                    desktop the next action is the accent-ringed card inline
 *                    on the line; on a phone that card is often below the fold,
 *                    so the action follows the thumb instead.
 *
 * Both are display:none above 900px — one component tree, no second surface to
 * keep in sync.
 */
"use client"

import type { Severity } from "./cv-severity"
import { SEVERITY_ORDER } from "./cv-severity"
import type { TriageCounts } from "./issue-model"

interface CvSeverityChipsProps {
  counts: TriageCounts
  filter: Severity | null
  onFilter: (severity: Severity | null) => void
}

export function CvSeverityChips({ counts, filter, onFilter }: CvSeverityChipsProps) {
  return (
    <div className="cvw-chips" role="group" aria-label="Filter by severity">
      {SEVERITY_ORDER.map(sev => {
        const n = counts[sev]
        const on = filter === sev
        return (
          <button
            key={sev}
            type="button"
            className="cvw-chip"
            data-sev={sev}
            data-empty={n === 0}
            aria-pressed={on}
            disabled={n === 0 && !on}
            onClick={() => onFilter(on ? null : sev)}
          >
            {n} {sev}
          </button>
        )
      })}
    </div>
  )
}

interface CvDoNowBarProps {
  title: string
  /** Position in the queue — "1 of 9". */
  index: number
  total: number
  ctaLabel: string
  onCta: () => void
}

export function CvDoNowBar({ title, index, total, ctaLabel, onCta }: CvDoNowBarProps) {
  return (
    <div className="cvw-donow">
      <div className="cvw-donow-head">
        <span className="cvw-donow-eyebrow">do this next</span>
        <span className="cvw-donow-count">{index} of {total}</span>
      </div>
      <div className="cvw-donow-title">{title}</div>
      <button type="button" className="cvw-donow-cta" onClick={onCta}>{ctaLabel}</button>
    </div>
  )
}
