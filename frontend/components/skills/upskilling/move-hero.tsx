/* "Your move" — the single calm next action. Replaces NextSetHero. */

import type { JSX } from "react"
import { Icon } from "./icons"
import { PROFICIENCY } from "./proficiency"
import { buildRungs, RungPath } from "./rung-path"
import type { LadderSkill } from "./types"

export function MoveHero({
  skill,
  primaryRole,
  onStart,
}: {
  skill: LadderSkill
  /** Primary target role title, when the user has one set — grounds the
      "closes a gap for" line in something real rather than a generic count. */
  primaryRole: string | null
  onStart: (skill: LadderSkill, level: number) => void
}): JSX.Element {
  const next = Math.min(skill.clearedLevel + 1, 5)
  const nextTier = PROFICIENCY[next]
  const rungs = buildRungs(skill.clearedLevel, (lvl) => onStart(skill, lvl))
  const focusRung = rungs.find((r) => r.state === "focus")

  return (
    <section className="up-move" aria-label="Your move">
      <div className="up-move-ring" aria-hidden="true" />
      <div className="up-move-l">
        <div className="up-move-kicker">
          <span className="up-move-dot" aria-hidden="true" />
          <span className="up-label">Your move</span>
        </div>
        <h1 className="up-move-name">{skill.name}</h1>
        <p className="up-move-body">
          Clear the <b>{nextTier}</b> rung — 10 questions, untimed. Nail <b>8/10</b> to bank it onto your CV.
        </p>
        {(primaryRole || skill.jobCount > 0) && (
          <p className="up-move-reason">
            <Icon name="target" size={12} />
            {primaryRole ? <>Closes a gap for <span>{primaryRole}</span></> : "Closes a gap"}
            {skill.jobCount > 0 && <> · wanted by {skill.jobCount} of your jobs</>}
          </p>
        )}

        <div className="up-move-path">
          <RungPath rungs={rungs} size="hero" />
          <div className="up-move-path-cap">
            <span>{focusRung ? <><b>{PROFICIENCY[focusRung.lvl]}</b> · your move</> : "Your move"}</span>
            <span>Legend</span>
          </div>
        </div>
      </div>

      <div className="up-move-r">
        <button type="button" className="up-btn up-btn-primary up-move-cta" onClick={() => onStart(skill, next)}>
          <Icon name="bolt" size={16} /> Start · {nextTier}
        </button>
        <div className="up-move-tiers">
          <Icon name="coin" size={13} /> +50 · +30 · +20 by score
        </div>
      </div>
    </section>
  )
}
