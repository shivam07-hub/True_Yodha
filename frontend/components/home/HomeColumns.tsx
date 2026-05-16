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
  // skillGapData === undefined means still loading (query not yet resolved)
  // "Skills to build" = skills user has zero proficiency in (user_level === 0)
  const isLoading = skillGapData === undefined
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
          {isLoading ? "…" : toBuildSkills.length}
        </span>
      </div>

      {isLoading ? (
        // Loading skeleton — shown while switching company tabs
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[80, 65, 90, 72, 58, 85].map((w, i) => (
            <div key={i} style={{
              height: 38, borderRadius: 7,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid var(--tm-border-soft)",
              display: "flex", alignItems: "center", padding: "0 10px", gap: 10,
              animation: "shimmer 1.4s ease infinite",
              animationDelay: `${i * 80}ms`,
            }}>
              <div style={{ flex: 1, height: 10, borderRadius: 4, background: "rgba(255,255,255,0.06)", maxWidth: `${w}%` }} />
              <div style={{ width: 48, height: 10, borderRadius: 4, background: "rgba(255,255,255,0.04)", flexShrink: 0 }} />
              <div style={{ width: 68, height: 24, borderRadius: 99, background: "rgba(0,245,212,0.07)", border: "1px solid rgba(0,245,212,0.15)", flexShrink: 0 }} />
            </div>
          ))}
        </div>
      ) : toBuildSkills.length === 0 ? (
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

