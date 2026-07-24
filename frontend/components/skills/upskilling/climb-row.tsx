/* One skill row in "Your climb" — name + badge + demand + rung path + CTA.
   Replaces the old SkillCard. */

import type { JSX } from "react"
import type { DemandBand } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Icon } from "./icons"
import { DEMAND_LABEL } from "./proficiency"
import { buildRungs, climbFraction, RungPath } from "./rung-path"
import type { LadderSkill } from "./types"

const isHot = (d: DemandBand): boolean => d === "very_high" || d === "high"

export function ClimbRow({
  skill,
  onStart,
}: {
  skill: LadderSkill
  onStart: (skill: LadderSkill, level: number) => void
}): JSX.Element {
  const maxed = skill.clearedLevel >= 5
  const next = Math.min(skill.clearedLevel + 1, 5)
  const hot = isHot(skill.demand)
  const rungs = buildRungs(skill.clearedLevel, (lvl) => onStart(skill, lvl))

  return (
    <article className="up-climb-row">
      <div className="up-climb-id">
        <div className="up-climb-nameline">
          <span className="up-climb-name">{skill.name}</span>
          {skill.onCV ? (
            <span className="up-climb-badge is-oncv">
              <Icon name="check" size={11} /> {maxed ? "Legend" : `On CV · L${skill.clearedLevel}`}
            </span>
          ) : (
            <span className="up-climb-badge is-new">New skill</span>
          )}
        </div>
        <div className="up-climb-demand">
          {skill.demand !== "none" ? (
            hot
              ? <span className="is-hot"><Icon name="flame" size={12} /> {DEMAND_LABEL[skill.demand]}</span>
              : <span>{DEMAND_LABEL[skill.demand]}</span>
          ) : null}
          {skill.jobCount > 0 && <span className="up-climb-demand-n">· wanted by {skill.jobCount} of your jobs</span>}
          {skill.upvotes > 0 && <span className="up-climb-upvote">▲ {skill.upvotes}</span>}
        </div>
      </div>

      <div className="up-climb-mid">
        <RungPath rungs={rungs} size="row" showFill fillFraction={climbFraction(skill.clearedLevel)} />
      </div>

      <div className="up-climb-cta">
        {maxed ? (
          <span className="up-climb-legend"><Icon name="star" size={13} /> Legend</span>
        ) : (
          <Button size="sm" className="up-btn" onClick={() => onStart(skill, next)}>
            <Icon name="bolt" size={14} /> Start · L{next}
          </Button>
        )}
      </div>
    </article>
  )
}
