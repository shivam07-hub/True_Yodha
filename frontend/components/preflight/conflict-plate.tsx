"use client"

/**
 * Same plate shape as a settled line, warmer stroke, and the two (or more)
 * statements sit INSIDE with an inline chooser. The user picks; the losers
 * are dropped through the same `answerLine` call the shell uses everywhere
 * else. No modal-in-modal, no "THESE CAN'T BOTH BE TRUE" screaming.
 */

import { conflictAsk, dropIdsForPick } from "@/lib/preflight/conflicts"
import { formatRelativeAge } from "@/lib/format"
import {
  KIND_EYEBROW,
  SOURCE_LABEL,
  type OrderConflict,
  type OrderLine,
} from "@/lib/preflight/types"

export function ConflictPlate({
  conflict,
  lines,
  onDrop,
  busy,
}: {
  conflict: OrderConflict
  lines: OrderLine[]
  onDrop: (lineId: string) => void
  busy?: boolean
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
    <div className="pf-plate" data-kind="conflict" role="group" aria-label={conflictAsk(conflict)}>
      <div className="pf-plate-conflict-title">{conflictAsk(conflict)}</div>
      <div className="pf-plate-conflict-choices" role="radiogroup">
        {options.map((option) => {
          const when = whenMs(option.answered_at)
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={false}
              className="pf-plate-choice tm-control-focus"
              onClick={() => {
                for (const drop of dropIdsForPick(conflict, option.id)) onDrop(drop)
              }}
              disabled={busy}
            >
              <span className="pf-plate-choice-text">{option.text}</span>
              <span className="pf-plate-choice-meta">
                {option.kind ? <span>{KIND_EYEBROW[option.kind]}</span> : null}
                {option.source ? <span>{SOURCE_LABEL[option.source]}</span> : null}
                {Number.isFinite(when) ? <span>{formatRelativeAge(when)}</span> : null}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function whenMs(iso: string | null | undefined): number {
  if (!iso) return Number.NaN
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : Number.NaN
}
