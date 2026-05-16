"use client"

import type { SkillGapItem, SkillGapResponse } from "@/lib/api"
import { SkillRow } from "./SkillRow"

// ── SkillGapCol ───────────────────────────────────────────────────────────────

interface SkillGapColProps {
  skillGapData?: SkillGapResponse
  cartSkillNames: Set<string>
  onSkillToggle: (skill: SkillGapItem) => void
}

export function SkillGapCol({ skillGapData, cartSkillNames, onSkillToggle }: SkillGapColProps) {
  // "Skills to build" = skills the user has zero proficiency in (user_level === 0).
  // Skills the user already has at any level — even if below required — belong on the
  // "Skills you already match" panel (HeroCard), so we filter them out here to avoid
  // showing the same skill on both panels.
  const toBuildSkills = skillGapData?.skills.filter(s => s.user_level === 0) ?? []
  return (
    <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 10, padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
        <span style={{ fontSize: 11, letterSpacing: "0.1em", color: "var(--tm-warning)", textTransform: "uppercase", fontWeight: 700 }}>Skills to build</span>
        <span style={{
          fontFamily: "var(--tm-font-mono)", fontSize: 10, padding: "2px 7px", borderRadius: 99,
          background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
          color: "var(--tm-warning)",
        }}>
          {toBuildSkills.length}
        </span>
      </div>
      {toBuildSkills.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--tm-text-faint)", fontStyle: "italic" }}>
          Nothing new to learn — you already have at least L1 in every required skill.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {toBuildSkills.map(s => (
            <SkillRow key={s.skill} skill={s} inCart={cartSkillNames.has(s.skill)} onToggle={() => onSkillToggle(s)} />
          ))}
        </div>
      )}
    </div>
  )
}

