"use client"

import { ScoreRing } from "@/components/skills/score-ring"
import { ShareButton } from "@/components/profile/ShareButton"
import type { SkillIntelStats } from "@/lib/skill-domains"

interface Props {
  totalScore: number | null
  ninjaName?: string | null
  stats: SkillIntelStats | null
}

/**
 * Skill-Intelligence header. The Myro Score is the page headline (left); the
 * four stat tiles are an at-a-glance orientation strip (skills / domains / need
 * proof / below 40%). They are display-only — the Upskilling ladder below owns
 * its own organization (Quick-wins vs Hottest sort, on-CV vs gap grouping), so
 * the header carries no competing filter control.
 */
export function SkillIntelHeader({ totalScore, ninjaName, stats }: Props) {
  const shareUrl =
    ninjaName && typeof window !== "undefined"
      ? `${window.location.origin}/profile/${ninjaName}`
      : ninjaName
        ? `/profile/${ninjaName}`
        : null

  return (
    <>
      <div className="tm-pv-head">
        <div className="tm-pv-head-id" style={{ minWidth: 0 }}>
          {totalScore !== null && <ScoreRing score={totalScore} />}
        </div>
        <div className="tm-pv-head-actions">
          {shareUrl && <ShareButton url={shareUrl} ninjaName={ninjaName ?? undefined} score={totalScore} />}
        </div>
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
