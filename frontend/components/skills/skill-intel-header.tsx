"use client"

import { useState } from "react"
import { ScoreRing } from "@/components/skills/score-ring"
import { ShareButton } from "@/components/profile/ShareButton"
import type { SkillIntelStats } from "@/lib/skill-domains"
import type { SkillFilterState, SkillStatus } from "@/lib/skill-filter"

interface Props {
  totalScore: number | null
  ninjaName?: string | null
  stats: SkillIntelStats | null
  /** All domain names, for the "Domains" tile picker. */
  domains: string[]
  filter: SkillFilterState
  onFilterChange: (next: SkillFilterState) => void
}

/**
 * Skill-Intelligence header. The Myro Score is the page headline (left); the
 * "Skill Intelligence / Practice" title was removed — nav already names the
 * surface. The 4 stat tiles are the page's single unified filter (status axis +
 * a domain picker), driving the skill list below. There is no separate filter
 * row anymore.
 */
export function SkillIntelHeader({ totalScore, ninjaName, stats, domains, filter, onFilterChange }: Props) {
  const [domainOpen, setDomainOpen] = useState(false)

  const shareUrl =
    ninjaName && typeof window !== "undefined"
      ? `${window.location.origin}/profile/${ninjaName}`
      : ninjaName
        ? `/profile/${ninjaName}`
        : null

  const setStatus = (status: SkillStatus) =>
    onFilterChange({ ...filter, status, domain: null })

  const statusActive = (s: SkillStatus) => filter.status === s && !filter.domain

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
        <>
          <div className="tm-skills-stat-grid" role="group" aria-label="Filter skills">
            <button
              type="button"
              className={`tm-skills-stat-tile tm-control-focus${statusActive("all") ? " is-active" : ""}`}
              aria-pressed={statusActive("all")}
              onClick={() => { setDomainOpen(false); setStatus("all") }}
            >
              <span className="label">Skills</span>
              <span className="value">{stats.totalSkills}</span>
            </button>

            <button
              type="button"
              className={`tm-skills-stat-tile tm-control-focus${filter.domain ? " is-active" : ""}`}
              aria-pressed={!!filter.domain}
              aria-expanded={domainOpen}
              onClick={() => setDomainOpen((v) => !v)}
            >
              <span className="label">Domains</span>
              <span className="value">{stats.domainCount}</span>
            </button>

            <button
              type="button"
              className={`tm-skills-stat-tile tm-control-focus${statusActive("need-proof") ? " is-active" : ""}`}
              aria-pressed={statusActive("need-proof")}
              onClick={() => { setDomainOpen(false); setStatus("need-proof") }}
            >
              <span className="label">Need proof</span>
              <span className="value">{stats.needProofCount}</span>
            </button>

            <button
              type="button"
              className={`tm-skills-stat-tile tm-control-focus${statusActive("below-40") ? " is-active" : ""}`}
              aria-pressed={statusActive("below-40")}
              onClick={() => { setDomainOpen(false); setStatus("below-40") }}
            >
              <span className="label">Below 40%</span>
              <span className="value warning">{stats.weakDomainCount}</span>
            </button>
          </div>

          {domainOpen && (
            <div className="tm-skills-domain-pick">
              <label htmlFor="tm-domain-select" className="tm-label-caps">Filter by domain</label>
              <select
                id="tm-domain-select"
                className="tm-skills-domain-select tm-control-focus"
                value={filter.domain ?? ""}
                onChange={(e) => onFilterChange({ ...filter, domain: e.target.value || null, status: "all" })}
              >
                <option value="">All domains</option>
                {domains.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}
        </>
      )}
    </>
  )
}
