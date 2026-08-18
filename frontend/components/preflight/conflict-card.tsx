"use client"

/**
 * One either/or. Both statements, each with its source and when it was said.
 * The user picks; the losers are dropped. Duplicates never land here — they
 * were not a decision.
 */

import { formatRelativeAge } from "@/lib/format"
import { conflictAsk } from "@/lib/preflight/conflicts"
import {
  KIND_EYEBROW,
  SOURCE_LABEL,
  type OrderConflict,
  type OrderLine,
} from "@/lib/preflight/types"

export function ConflictCard({
  conflict,
  lines,
  onPick,
}: {
  conflict: OrderConflict
  lines: OrderLine[]
  onPick: (lineId: string) => void
}) {
  const byId = new Map(lines.map((line) => [line.id, line]))
  const options = conflict.line_ids
    .map((id, i) => {
      const line = byId.get(id)
      if (line && line.status !== "kept") return null
      return {
        id,
        text: line?.text ?? conflict.texts[i] ?? "",
        kind: line?.kind,
        source: line?.source,
        source_note: line?.source_note,
        answered_at: line?.answered_at,
      }
    })
    .filter((option): option is NonNullable<typeof option> => option !== null)

  return (
    <div className="pf-either" role="group" aria-label={conflictAsk(conflict)}>
      <div className="pf-order-eyebrow">{conflictAsk(conflict)}</div>
      {options.map((option, i) => {
        const when = whenMs(option.answered_at)
        return (
        <div key={option.id}>
          {i > 0 ? <div className="pf-either-or" aria-hidden>or</div> : null}
          <button
            type="button"
            className="pf-either-option tm-control-focus"
            onClick={() => onPick(option.id)}
          >
            {option.kind ? <div className="pf-guess-eyebrow">{KIND_EYEBROW[option.kind]}</div> : null}
            <div className="pf-guess-text">{option.text}</div>
            <div className="pf-guess-meta">
              {option.source ? <span className="pf-source">{SOURCE_LABEL[option.source]}</span> : null}
              {when ? <span className="pf-note">{formatRelativeAge(when)}</span> : option.source_note ? (
                <span className="pf-note">{option.source_note}</span>
              ) : null}
            </div>
          </button>
        </div>
        )
      })}
    </div>
  )
}

function whenMs(iso: string | null | undefined): number {
  if (!iso) return Number.NaN
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : Number.NaN
}
