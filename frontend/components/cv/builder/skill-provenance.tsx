/**
 * SkillProvenance — "where each skill comes from in your CV", told honestly.
 *
 * Homed in the Skills rail, right beside the skills line it explains. Every
 * skill Myro scored shows two things and only two things: the level it was
 * given, and the receipt it was given for. If there is no receipt, it says so.
 *
 * Why the rewrite: this used to treat *empty* evidence as the only unproven
 * case. Prod says otherwise — 16% of published `user_skills` carry evidence that
 * merely repeats the skill's own name, and those rendered as quote cards
 * indistinguishable from a real achievement bullet. See lib/cv/skill-proof.ts.
 * Tiers now come from that one shared rule, so this surface and the first-run
 * confirm step can never disagree.
 *
 * Also the edit surface: pass `onToggleRemoved` and each skill gains Remove /
 * Restore. That serves both the first-run confirmation (nothing published until
 * the user says so) and permanent correction afterwards — the same control in
 * the same place, so the thing learned on day one keeps working on day one
 * hundred.
 *
 * Read-only without those props. Fed by the existing users.mySkills query.
 */
"use client"

import { useMemo } from "react"
import type { UserSkillItem } from "@/lib/api"
import { PROOF_TIER_COPY, proofTier, type ProofTier } from "@/lib/cv/skill-proof"

const TIER_ORDER: ProofTier[] = ["proven", "listed", "none"]

interface PointGroup {
  /** The CV text these skills were read from. Empty for the no-proof tier. */
  evidence: string
  skills: UserSkillItem[]
  topLevel: number
}

interface TierGroup {
  tier: ProofTier
  points: PointGroup[]
  count: number
}

export interface SkillProvenanceProps {
  allSkills: UserSkillItem[]
  focusSkill?: string | null
  /** The CV's own skills paragraph. Turns listed-vs-proven into exact provenance. */
  skillsLine?: string | null
  /** Keys the user has removed. Rendered struck-through, still restorable. */
  removed?: Set<string>
  /** Omit to render read-only. */
  onToggleRemoved?: (key: string) => void
  /** Keys with a write in flight. */
  pendingKeys?: Set<string>
}

function groupByEvidence(skills: UserSkillItem[], keepEvidence: boolean): PointGroup[] {
  if (!keepEvidence) {
    return skills.length
      ? [{
          evidence: "",
          skills: skills.slice().sort((a, b) => b.level - a.level || a.display_name.localeCompare(b.display_name)),
          topLevel: Math.max(...skills.map((s) => s.level)),
        }]
      : []
  }
  const byPoint = new Map<string, UserSkillItem[]>()
  for (const skill of skills) {
    const evidence = (skill.evidence_text ?? "").trim()
    const bucket = byPoint.get(evidence)
    if (bucket) bucket.push(skill)
    else byPoint.set(evidence, [skill])
  }
  return Array.from(byPoint.entries())
    .map(([evidence, group]) => ({
      evidence,
      skills: group.slice().sort((a, b) => b.level - a.level),
      topLevel: Math.max(...group.map((s) => s.level)),
    }))
    .sort((a, b) => b.topLevel - a.topLevel || b.skills.length - a.skills.length)
}

export function SkillProvenance({
  allSkills,
  focusSkill,
  skillsLine,
  removed,
  onToggleRemoved,
  pendingKeys,
}: SkillProvenanceProps) {
  const tiers = useMemo<TierGroup[]>(() => {
    const buckets: Record<ProofTier, UserSkillItem[]> = { proven: [], listed: [], none: [] }
    for (const skill of allSkills) {
      buckets[proofTier(skill.evidence_text, skill.display_name, skillsLine)].push(skill)
    }
    return TIER_ORDER.map((tier) => ({
      tier,
      count: buckets[tier].length,
      // Only a real receipt earns a quote. The no-proof tier has nothing to quote.
      points: groupByEvidence(buckets[tier], tier !== "none"),
    })).filter((group) => group.count > 0)
  }, [allSkills, skillsLine])

  if (allSkills.length === 0) {
    return <p className="cvb-prov-empty">Upload a CV to see where your skills come from.</p>
  }

  const editable = Boolean(onToggleRemoved)

  return (
    <div className="cvb-prov">
      <div className="cvb-prov-label">Where each skill comes from</div>

      <p className="cvb-prov-tally">
        {tiers.map((group, index) => (
          <span key={group.tier} className={`cvb-prov-tally-part is-${group.tier}`}>
            {index > 0 && <span aria-hidden="true"> · </span>}
            <b>{group.count}</b> {group.tier === "none" ? "no proof" : group.tier}
          </span>
        ))}
      </p>

      {tiers.map((group) => (
        <section key={group.tier} className={`cvb-prov-tier is-${group.tier}`}>
          <div className="cvb-prov-tier-head">
            <span className="cvb-prov-tier-label">{PROOF_TIER_COPY[group.tier].label}</span>
            <span className="cvb-prov-tier-count">{group.count}</span>
          </div>
          {group.tier !== "proven" && (
            <p className="cvb-prov-tier-note">{PROOF_TIER_COPY[group.tier].note}</p>
          )}

          {group.points.map((point) => (
            <div key={point.evidence || group.tier} className="cvb-prov-point">
              {point.evidence && <p className="cvb-prov-quote">{point.evidence}</p>}
              <div className="cvb-prov-chips">
                {point.skills.map((skill) => {
                  const isRemoved = removed?.has(skill.key) ?? false
                  const isPending = pendingKeys?.has(skill.key) ?? false
                  const isFocus =
                    skill.display_name.toLocaleLowerCase() === focusSkill?.toLocaleLowerCase()
                  return (
                    <span
                      key={skill.key}
                      className={[
                        "cvb-prov-chip",
                        `is-${group.tier}`,
                        isFocus ? "is-focus" : "",
                        isRemoved ? "is-removed" : "",
                      ].filter(Boolean).join(" ")}
                      title={skill.proficiency_title || undefined}
                    >
                      {skill.display_name}
                      <em className="cvb-prov-lvl">L{skill.level}</em>
                      {editable && (
                        <button
                          type="button"
                          className="cvb-prov-drop tm-control-focus"
                          onClick={() => onToggleRemoved?.(skill.key)}
                          disabled={isPending}
                          aria-label={
                            isRemoved
                              ? `Restore ${skill.display_name}`
                              : `Remove ${skill.display_name}`
                          }
                          title={isRemoved ? "Restore" : "Not mine — remove"}
                        >
                          {isRemoved ? "↺" : "×"}
                        </button>
                      )}
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
