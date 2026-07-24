/* Adaptive Forge context bar — slim, sticky, full-bleed under the app nav.
   Score module + band line + stat chips + share + a collapsed target-role
   pill. The full score decomposition lives on /skills now (T2-3); this bar
   stays display-only so the two surfaces don't duplicate the same "why". */

"use client"

import Link from "next/link"
import type { JSX } from "react"
import { BandPercentileLine } from "@/components/skills/band-percentile-line"
import { ShareButton } from "@/components/profile/ShareButton"
import { tierForScore } from "@/lib/score-tiers"
import type { SkillIntelStats } from "@/lib/skill-domains"
import { Icon } from "./icons"

function ScoreModule({ score, band, topPercent }: { score: number; band?: string | null; topPercent?: number | null }): JSX.Element {
  const R = 16
  const C = 2 * Math.PI * R
  const tier = tierForScore(score)
  const bandFloor = tier.min
  const bandCeil = tier.next ?? 100
  const pct = bandCeil > bandFloor ? Math.min(1, Math.max(0, (score - bandFloor) / (bandCeil - bandFloor))) : 1
  return (
    <Link href="/skills" className="up-bar-score" aria-label={`Myro Score ${score}. See the full breakdown.`}>
      <svg width={44} height={44} viewBox="0 0 44 44" aria-hidden="true">
        <circle cx={22} cy={22} r={R} fill="none" stroke="var(--tm-surface-2)" strokeWidth={4} />
        <circle
          cx={22} cy={22} r={R} fill="none" stroke="var(--tm-accent)" strokeWidth={4} strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - score / 100)}
          transform="rotate(-90 22 22)"
        />
        <text x={22} y={26} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--tm-text)" fontFamily="var(--tm-font-mono)">{score}</text>
      </svg>
      <div className="up-bar-score-id">
        <div className="up-bar-score-line">
          <span className="tier">{tier.label}</span>
          {tier.next != null && <span className="next">{score} → {tier.next} {tier.nextLabel}</span>}
        </div>
        <div className="up-bar-score-track">
          <div className="up-bar-score-track-bg">
            <div className="up-bar-score-fill" style={{ width: `${pct * 100}%` }} />
          </div>
          <BandPercentileLine band={band} topPercent={topPercent} />
        </div>
      </div>
    </Link>
  )
}

function openTargetRoleSettings(): void {
  document.dispatchEvent(new CustomEvent("tm:open-settings", { detail: { tab: "Following" } }))
}

function RolePill({ roleTitles }: { roleTitles: string[] }): JSX.Element | null {
  if (roleTitles.length === 0) return null
  const [primary, ...rest] = roleTitles
  return (
    <button type="button" className="up-bar-role" onClick={openTargetRoleSettings}>
      <Icon name="target" size={13} />
      <span className="name">{primary}</span>
      {rest.length > 0 && <span className="n">+{rest.length}</span>}
    </button>
  )
}

export function ForgeContextBar({
  onBack,
  score,
  band,
  topPercent,
  stats,
  ninjaName,
  roleTitles,
}: {
  onBack: () => void
  score: number | null
  band?: string | null
  topPercent?: number | null
  stats: SkillIntelStats | null
  ninjaName?: string | null
  roleTitles: string[]
}): JSX.Element {
  const shareUrl = ninjaName && typeof window !== "undefined" ? `${window.location.origin}/profile/${ninjaName}` : null

  return (
    <div className="up-forge-bar">
      <div className="up-forge-bar-inner">
        <button type="button" className="up-bar-back" onClick={onBack}>
          <Icon name="back" size={14} /> <span>Back</span>
        </button>

        {score !== null && <ScoreModule score={score} band={band} topPercent={topPercent} />}

        <div className="up-forge-bar-spacer" />

        {stats && (
          <div className="up-bar-stats">
            <span className="chip">{stats.totalSkills} skills</span>
            <span className="chip">{stats.domainCount} domains</span>
            {stats.weakDomainCount > 0 && <span className="chip is-warning">{stats.weakDomainCount} below 40%</span>}
          </div>
        )}

        {shareUrl && <ShareButton url={shareUrl} ninjaName={ninjaName ?? undefined} score={score} />}

        <RolePill roleTitles={roleTitles} />
      </div>
    </div>
  )
}
