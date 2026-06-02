"use client"

import { useEffect, useState } from "react"
import { DomainRadar } from "@/components/skills/domain-radar"
import { LevelDots } from "@/components/skills/level-dots"
import { skillTierLabel } from "@/lib/skill-tier"
import type { UserSkillItem, UserSkillsByDomain } from "@/lib/api"

interface Props {
  userSkills: UserSkillsByDomain
  /** Deep-link / stat-jump target — opens the drill panel on this domain. */
  initialDomain?: string | null
  onPractice: (skillName: string, levelFrom: number, levelTo: number) => void
}

/**
 * Map tab — the spatial domain story. Radar on the left, a domain-detail drill
 * panel on the right (desktop) / below (mobile). Clicking a radar spoke reveals
 * that domain's skills with a per-skill Practice button, so inspect-mode bridges
 * to action without yanking the user out to the Practice tab on every poke.
 */
export function SkillMapTab({ userSkills, initialDomain, onPractice }: Props) {
  const domains = Object.keys(userSkills.by_domain)
  const [active, setActive] = useState<string | null>(initialDomain ?? null)

  useEffect(() => {
    if (initialDomain) setActive(initialDomain)
  }, [initialDomain])

  const activeItems = active ? (userSkills.by_domain[active] ?? []) : []

  return (
    <div className="tm-pv-map">
      <div className="tm-pv-map-radar">
        <div className="tm-label-caps" style={{ marginBottom: 4 }}>Domain Map</div>
        <div className="tm-pv-map-hint">{domains.length} domains · tap a point to drill in</div>
        {domains.length > 0 ? (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <DomainRadar
              userSkills={userSkills}
              activeDomain={active}
              onDomainClick={(d) => setActive((a) => (a === d ? null : d))}
            />
          </div>
        ) : (
          <div className="tm-pv-map-empty">No skills mapped yet.</div>
        )}
        <div className="tm-pv-map-info">
          <span style={{ opacity: 0.6 }}>ℹ</span>
          <span>Each point = one domain. Distance from center = score.</span>
        </div>
      </div>

      <div className="tm-pv-drill">
        {active ? (
          <DrillPanel domain={active} items={activeItems} onPractice={onPractice} />
        ) : (
          <div className="tm-pv-drill-empty">
            Tap a domain on the map to see its skills.
          </div>
        )}
      </div>
    </div>
  )
}

function DrillPanel({ domain, items, onPractice }: {
  domain: string
  items: UserSkillItem[]
  onPractice: (skillName: string, levelFrom: number, levelTo: number) => void
}) {
  const sorted = [...items].sort((a, b) => a.level - b.level)
  return (
    <div className="tm-pv-drill-card">
      <div className="tm-pv-drill-head">
        <div className="tm-label-caps">Domain</div>
        <h3 className="tm-pv-drill-name">{domain}</h3>
        <div className="tm-pv-drill-sub">{items.length} {items.length === 1 ? "skill" : "skills"}</div>
      </div>
      {sorted.length === 0 ? (
        <div className="tm-pv-drill-empty">No skills in this domain.</div>
      ) : (
        <ul className="tm-pv-drill-list">
          {sorted.map((s) => (
            <li key={s.key} className="tm-pv-drill-row">
              <div className="tm-pv-drill-skill">
                <span className="tm-pv-drill-skill-name">{s.display_name}</span>
                <span className="tm-pv-drill-skill-meta">
                  <LevelDots level={s.level} skillName={s.display_name} size={7} />
                  <span className="tm-pr-mono">L{s.level} · {skillTierLabel(s.level)}</span>
                </span>
              </div>
              <button
                type="button"
                className="tm-pr-mini tm-control-focus"
                onClick={() => onPractice(s.display_name, s.level, Math.min(s.level + 1, 5))}
              >
                Practice
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
