/* Shared 5-rung climb path — the "banked / focus / locked" visual language
   that replaced the old LevelLadder. A rung is startable only if it is
   already banked (re-practice) or is the immediate next level; anything
   beyond that renders locked regardless of question-bank readiness — the
   rare case where a bank is ready further ahead than the user has climbed
   is not worth surfacing as a shortcut. If the immediate-next bank isn't
   actually ready yet, the click still fires and the existing startSet()
   catch handles it with a "bank is filling" toast — same fallback as before,
   just no longer previewed in the rung itself. */

import type { JSX } from "react"
import { Icon } from "./icons"

export type RungState = "banked" | "focus" | "locked"

export interface Rung {
  lvl: number
  state: RungState
  onStart: (() => void) | null
}

export function buildRungs(clearedLevel: number, onStart: (lvl: number) => void): Rung[] {
  const maxed = clearedLevel >= 5
  const next = Math.min(clearedLevel + 1, 5)
  return [1, 2, 3, 4, 5].map((lvl) => {
    const banked = lvl <= clearedLevel
    const focus = !maxed && lvl === next
    const state: RungState = banked ? "banked" : focus ? "focus" : "locked"
    return { lvl, state, onStart: banked || focus ? () => onStart(lvl) : null }
  })
}

/** Fraction of the track between rung 1 and rung 5 that's already climbed —
    drives the teal fill line under a ClimbRow's rungs. */
export function climbFraction(clearedLevel: number): number {
  return clearedLevel <= 1 ? 0 : (clearedLevel - 1) / 4
}

export function RungPath({
  rungs,
  size = "row",
  showFill = false,
  fillFraction = 0,
}: {
  rungs: Rung[]
  size?: "hero" | "row"
  showFill?: boolean
  fillFraction?: number
}): JSX.Element {
  return (
    <div className={`up-rung-path is-${size}`} role="group" aria-label="Level path">
      <div className="up-rung-track" aria-hidden="true" />
      {showFill && (
        <div
          className="up-rung-fill"
          aria-hidden="true"
          style={{ width: `calc((100% - ${size === "hero" ? "52px" : "38px"}) * ${fillFraction})` }}
        />
      )}
      <div className="up-rung-nodes">
        {rungs.map((r) => {
          const label = r.state === "banked"
            ? `Level ${r.lvl} banked — re-practice`
            : r.state === "focus"
              ? `Start Level ${r.lvl}`
              : `Level ${r.lvl} — locked`
          const mark = r.state === "banked"
            ? <Icon name="check" size={size === "hero" ? 14 : 12} />
            : r.state === "focus"
              ? <Icon name="bolt" size={size === "hero" ? 14 : 12} />
              : `L${r.lvl}`
          if (r.onStart) {
            return (
              <button
                key={r.lvl} type="button" className={`up-rung is-${r.state}`}
                title={label} aria-label={label} onClick={r.onStart}
              >
                {mark}
              </button>
            )
          }
          return (
            <div key={r.lvl} className={`up-rung is-${r.state}`} title={label} aria-label={label}>
              {mark}
            </div>
          )
        })}
      </div>
    </div>
  )
}
