"use client"

import { ScoreRing } from "@/components/skills/score-ring"
import { ShareButton } from "@/components/profile/ShareButton"
import type { SkillIntelStats } from "@/lib/skill-domains"

interface Props {
  totalScore: number | null
  ninjaName?: string | null
  stats: SkillIntelStats | null
  /** Tap "Below 40%" → jump to the Map tab with weak domains lit. */
  onWeakJump: () => void
}

/**
 * Persistent Skill-Intelligence header shown on all Practice tabs. Carries
 * page-level identity (score + share) + the 4 stat tiles. The forge dial is a
 * Practice-tab tool and lives in the tab body, not here.
 */
export function SkillIntelHeader({ totalScore, ninjaName, stats, onWeakJump }: Props) {
  const shareUrl =
    ninjaName && typeof window !== "undefined"
      ? `${window.location.origin}/profile/${ninjaName}`
      : ninjaName
        ? `/profile/${ninjaName}`
        : null

  return (
    <>
      <div className="tm-pv-head">
        <div className="tm-pv-head-id">
          <div className="tm-label-caps" style={{ marginBottom: 6 }}>Skill Intelligence</div>
          <h1 className="tm-pr-title">Practice</h1>
        </div>
        <div className="tm-pv-head-actions">
          {shareUrl && <ShareButton url={shareUrl} ninjaName={ninjaName ?? undefined} score={totalScore} />}
          {totalScore !== null && <ScoreRing score={totalScore} />}
        </div>
      </div>

      {stats && (
        <div className="tm-skills-stat-grid" aria-label="Skill summary">
          <div className="tm-skills-stat-tile">
            <span className="label">Domains</span>
            <span className="value">{stats.domainCount}</span>
          </div>
          <div className="tm-skills-stat-tile">
            <span className="label">Skills</span>
            <span className="value">{stats.totalSkills}</span>
          </div>
          <div className="tm-skills-stat-tile">
            <span className="label">Need proof</span>
            <span className="value">{stats.needProofCount}</span>
          </div>
          <button type="button" onClick={onWeakJump} className="tm-skills-stat-tile tm-control-focus">
            <span className="label">Below 40%</span>
            <span className="value warning">{stats.weakDomainCount}</span>
          </button>
        </div>
      )}
    </>
  )
}
