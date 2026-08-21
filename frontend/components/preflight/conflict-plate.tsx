"use client"

/**
 * A slot the resolver cannot settle, asked inside the plate shape.
 *
 * Two kinds arrive here. A *contradiction* is "these can't both be true" —
 * pick the one that is, the other drops. An *arity* conflict is "this slot
 * takes six and you have nine" — tap to drop until it fits.
 *
 * What this replaced (shipped 2026-08-19): every option rendered as a fat
 * two-line card carrying WON'T TAKE · MYRO INFERRED · 4 DAYS AGO, so a
 * nine-line arity conflict became a nine-row wall of chrome — and the screen
 * had two of them. It also never said how many more the user had to drop, so
 * there was no way to know when the tapping ended.
 *
 * One line per option now. Provenance is the same rail the settled plates
 * use. The head carries the arithmetic.
 */

import { conflictAsk, dropIdsForPick, overflowCount } from "@/lib/preflight/conflicts"
import {
  SOURCE_LABEL,
  type LineSource,
  type OrderConflict,
  type OrderLine,
} from "@/lib/preflight/types"

const USER_SOURCES: readonly LineSource[] = ["user_said", "user_reworded"]

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
        source: line?.source,
      }
    })
    .filter((option): option is NonNullable<typeof option> => option !== null)

  // How many more taps until this slot fits. A contradiction and an arity-1
  // slot both resolve on one pick; a wider slot needs the overflow gone.
  const pickKeep = conflict.kind === "contradiction" || conflict.keep === 1
  const over = overflowCount(conflict, options.length)

  return (
    <div className="pf-plate" data-kind="conflict" role="group" aria-label={conflictAsk(conflict)}>
      <div className="pf-plate-conflict-head">
        <div className="pf-plate-conflict-title">
          {pickKeep ? conflictAsk(conflict) : "Too many for one search"}
        </div>
        {over > 0 ? (
          <div className="pf-plate-conflict-count">
            drop {over} more
          </div>
        ) : null}
      </div>

      <div className="pf-plate-conflict-choices">
        {options.map((option) => {
          const said = option.source && USER_SOURCES.includes(option.source) ? "user" : "myro"
          const label = pickKeep
            ? `Keep ${option.text}`
            : `Drop ${option.text}`
          return (
            <button
              key={option.id}
              type="button"
              data-said={said}
              className="pf-plate-choice tm-control-focus"
              aria-label={
                option.source ? `${label} — ${SOURCE_LABEL[option.source]}` : label
              }
              onClick={() => {
                for (const drop of dropIdsForPick(conflict, option.id)) onDrop(drop)
              }}
              disabled={busy}
            >
              <span className="pf-plate-choice-text">{option.text}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
