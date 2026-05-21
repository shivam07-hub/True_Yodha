"use client"

import type { SkillGapItem } from "@/lib/api"
import { sessionsForGap } from "@/lib/level-thresholds"

interface SkillRowProps {
  skill: SkillGapItem
  inCart: boolean
  onToggle?: () => void
}

const sessionsBetween = sessionsForGap

export function SkillRow({ skill, inCart, onToggle }: SkillRowProps) {
  if (skill.missing) {
    const sessions = sessionsBetween(skill.user_level ?? 0, skill.required_level ?? 1)
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
        borderRadius: 7,
        background: inCart ? "rgba(0,245,212,0.06)" : "rgba(251,113,133,0.04)",
        border: `1px solid ${inCart ? "var(--tm-accent-ring)" : "rgba(251,113,133,0.25)"}`,
        transition: "all 150ms var(--tm-ease)",
      }}>
        <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--tm-text)" }}>
          {skill.skill}
        </span>
        <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-danger)", flexShrink: 0 }}>
          L{skill.user_level}→L{skill.required_level}
        </span>
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={inCart ? `Remove ${skill.skill} from diary cart` : `Lock in ${skill.skill} for ${sessions} sessions`}
            className="tm-control-focus"
            style={{
              flexShrink: 0,
              minHeight: 32,
              padding: "0 12px",
              borderRadius: 99,
              fontSize: 11,
              fontWeight: 700,
              fontFamily: "var(--tm-font-mono)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 150ms var(--tm-ease)",
              ...(inCart ? {
                background: "var(--tm-accent-wash)",
                border: "1.5px solid var(--tm-accent-ring)",
                color: "var(--tm-accent)",
              } : {
                background: "linear-gradient(135deg, rgba(0,245,212,0.14) 0%, rgba(0,245,212,0.04) 100%)",
                border: "1.5px solid var(--tm-accent-ring)",
                color: "var(--tm-accent)",
              }),
            }}
          >
            {inCart ? "Remove" : `Lock in · ${sessions} ses`}
          </button>
        ) : (
          <span style={{
            flexShrink: 0,
            minHeight: 24,
            display: "inline-flex",
            alignItems: "center",
            padding: "0 9px",
            borderRadius: 99,
            border: "1px solid rgba(251,113,133,0.22)",
            background: "rgba(251,113,133,0.06)",
            color: "var(--tm-danger)",
            fontSize: 11,
            fontWeight: 650,
          }}>
            Needs practice
          </span>
        )}
      </div>
    )
  }

  const level = skill.user_level ?? 0
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
      borderRadius: 7, position: "relative", overflow: "hidden",
      background: "rgba(74,222,128,0.025)",
      border: "1px solid rgba(74,222,128,0.18)",
    }}>
      <div style={{
        position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
        width: 3, height: 16, borderRadius: "0 2px 2px 0",
        background: "linear-gradient(180deg, var(--tm-success) 0%, rgba(74,222,128,0.4) 100%)",
      }} />
      <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--tm-text)", marginLeft: 6 }}>
        {skill.skill}
      </span>
      <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: "50%",
            background: i < level ? "var(--tm-success)" : "rgba(74,222,128,0.18)",
          }} />
        ))}
      </div>
      <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-success)", flexShrink: 0 }}>
        L{level}
      </span>
      <span style={{
        flexShrink: 0,
        minHeight: 24,
        display: "inline-flex",
        alignItems: "center",
        padding: "0 9px",
        borderRadius: 99,
        border: "1px solid rgba(74,222,128,0.22)",
        background: "rgba(74,222,128,0.06)",
        color: "var(--tm-success)",
        fontSize: 11,
        fontWeight: 650,
      }}>
        Matched
      </span>
    </div>
  )
}
