/**
 * CvTriageTiles — rank 3's header: how many of each severity are open.
 *
 * Three equal tiles, a 24px mono numeral over a 2px severity top-border
 * (handoff §4.2). They are also the queue's filter: a user with 2 blocking and
 * 9 weak can hide the 9 and finish the 2, which is the entire point of having a
 * severity axis at all.
 *
 * A zero tile stays on screen in muted ink rather than disappearing — three
 * tiles that reflow to two as you fix things is a moving target, and "0
 * blocking" is the sentence the user is working toward.
 */
"use client"

import type { TriageCounts } from "./issue-model"
import { SEVERITY_ORDER, type Severity } from "./cv-severity"

interface CvTriageTilesProps {
  counts: TriageCounts
  /** null ⇒ no filter, every severity shows. */
  filter: Severity | null
  onFilter: (severity: Severity | null) => void
}

export function CvTriageTiles({ counts, filter, onFilter }: CvTriageTilesProps) {
  return (
    <div className="cvw-triage">
      {SEVERITY_ORDER.map(sev => {
        const n = counts[sev]
        const on = filter === sev
        return (
          <button
            key={sev}
            type="button"
            className="cvw-tile"
            data-sev={sev}
            data-empty={n === 0}
            aria-pressed={on}
            aria-label={`${n} ${sev} — ${on ? "clear filter" : "show only these"}`}
            disabled={n === 0 && !on}
            onClick={() => onFilter(on ? null : sev)}
          >
            <span className="cvw-tile-n">{n}</span>
            <span className="cvw-tile-label">{sev}</span>
          </button>
        )
      })}
    </div>
  )
}
