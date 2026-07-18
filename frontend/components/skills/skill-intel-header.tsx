"use client"

import { useState } from "react"
import { ScoreRing } from "@/components/skills/score-ring"
import { ScoreBreakdown } from "@/components/skills/score-breakdown"
import { BandPercentileLine } from "@/components/skills/band-percentile-line"
import { ShareButton } from "@/components/profile/ShareButton"
import { TargetRolesChips } from "@/components/target-role/target-roles-chips"
import type { SkillIntelStats } from "@/lib/skill-domains"
import type { GapSkill } from "@/lib/api"

interface Props {
  totalScore: number | null
  ninjaName?: string | null
  stats: SkillIntelStats | null
  /** Personal score decomposition (T2-3) — tapping the ring unfolds it in place. */
  domainScores?: Record<string, number>
  gapSkills?: GapSkill[]
  /** Band-relative confidence line ("top X% for {band}"). */
  band?: string | null
  topPercent?: number | null
}

/**
 * Skill-Intelligence header. The Myro Score is the page headline (left); the
 * four stat tiles are an at-a-glance orientation strip (skills / domains / need
 * proof / below 40%). They are display-only — the Upskilling ladder below owns
 * its own organization (Quick-wins vs Hottest sort, on-CV vs gap grouping), so
 * the header carries no competing filter control.
 */
export function SkillIntelHeader({ totalScore, ninjaName, stats, domainScores, gapSkills, band, topPercent }: Props) {
  const [open, setOpen] = useState(false)
  const shareUrl =
    ninjaName && typeof window !== "undefined"
      ? `${window.location.origin}/profile/${ninjaName}`
      : ninjaName
        ? `/profile/${ninjaName}`
        : null

  const canExplain = totalScore !== null && totalScore > 0 && !!domainScores && Object.keys(domainScores).length > 0

  return (
    <>
      <div className="tm-pv-head">
        <div className="tm-pv-head-id" style={{ minWidth: 0 }}>
          {totalScore !== null && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
              <ScoreRing
                score={totalScore}
                onExpand={canExplain ? () => setOpen((o) => !o) : undefined}
                expanded={open}
                controls="score-breakdown"
              />
              {totalScore > 0 && <BandPercentileLine band={band} topPercent={topPercent} />}
            </div>
          )}
        </div>
        <div className="tm-pv-head-actions">
          {shareUrl && <ShareButton url={shareUrl} ninjaName={ninjaName ?? undefined} score={totalScore} />}
        </div>
      </div>

      {canExplain && open && (
        <ScoreBreakdown
          id="score-breakdown"
          score={totalScore!}
          domainScores={domainScores!}
          gapSkills={gapSkills ?? []}
        />
      )}

      {/* The score above is CV-intrinsic (role-agnostic). Roles carry a per-role
          Readiness % instead — the role-specific signal, editable in place. */}
      <div className="tm-pv-head-role" style={{ marginTop: 8 }}>
        <TargetRolesChips editable showReadiness />
      </div>

      {stats && (
        <div className="tm-skills-stat-grid" role="group" aria-label="Skill summary">
          <div className="tm-skills-stat-tile">
            <span className="label">Skills</span>
            <span className="value">{stats.totalSkills}</span>
          </div>
          <div className="tm-skills-stat-tile">
            <span className="label">Domains</span>
            <span className="value">{stats.domainCount}</span>
          </div>
          <div className="tm-skills-stat-tile">
            <span className="label">Need proof</span>
            <span className="value">{stats.needProofCount}</span>
          </div>
          <div className="tm-skills-stat-tile">
            <span className="label">Below 40%</span>
            <span className="value warning">{stats.weakDomainCount}</span>
          </div>
        </div>
      )}
    </>
  )
}
