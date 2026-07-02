"use client"

import { useState } from "react"
import { ScoreRing } from "@/components/skills/score-ring"
import { ScoreBreakdown } from "@/components/skills/score-breakdown"
import { TargetRoleEditor } from "@/components/target-role/target-role-editor"
import { CompactMoves } from "./compact-moves"
import type { NextBestStep } from "@/lib/onboarding/next-best-steps"
import type { GapSkill } from "@/lib/api"

interface CommandRailProps {
  greeting: string
  name: string
  dateLine: string
  activeTargets: number
  score: number
  domainScores: Record<string, number>
  gapSkills: GapSkill[]
  role?: string | null
  moves: NextBestStep[]
}

/**
 * First-drop rail (/market) — the score screen's Command Center, compact. The
 * daily-loop ring was retired here: a new user needs the score-improvement plan,
 * not a habit tracker. Order = how am I → why → what next:
 *   1. ScoreRing — tap unfolds the personal breakdown in place (T2-3)
 *   2. Scored-for role — editable at point of use (#145)
 *   3. Three ranked moves — terse, one accent, all clickable (CompactMoves)
 * Mirrors SkillIntelHeader so the two score surfaces stay one product.
 */
export function CommandRail({
  greeting, name, dateLine, activeTargets, score, domainScores, gapSkills, role, moves,
}: CommandRailProps) {
  const [open, setOpen] = useState(false)
  const canExplain = score > 0 && Object.keys(domainScores).length > 0
  const targets = `${activeTargets} active target${activeTargets === 1 ? "" : "s"}`

  return (
    <div className="mc-rail cmd-rail">
      <div className="mc-rail-meta">
        <span className="mc-rail-hi">{greeting}, <strong>{name}</strong></span>
        <span className="mc-rail-sub">{dateLine} <span className="sep">·</span> {targets}</span>
      </div>

      <ScoreRing
        score={score}
        onExpand={canExplain ? () => setOpen((o) => !o) : undefined}
        expanded={open}
        controls="rail-score-breakdown"
      />

      {canExplain && open && (
        <ScoreBreakdown
          id="rail-score-breakdown"
          score={score}
          domainScores={domainScores}
          gapSkills={gapSkills}
        />
      )}

      <div className="cmd-rail-role">
        <TargetRoleEditor role={role} label="Scored for" />
      </div>

      <CompactMoves steps={moves} />
    </div>
  )
}
