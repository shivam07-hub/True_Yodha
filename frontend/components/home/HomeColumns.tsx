"use client"

import Link from "next/link"
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

// ── CVCol ─────────────────────────────────────────────────────────────────────

interface CVColProps {
  job: { overlap_score: number; company: string | null }
  onSpendXP: (amount: number, action: string) => void
}

export function CVCol({ job, onSpendXP }: CVColProps) {
  const fit = Math.min(100, Math.round(job.overlap_score))
  const color = fit >= 70 ? "var(--tm-success)" : fit >= 50 ? "var(--tm-warning)" : "var(--tm-danger)"

  return (
    <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 10, padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, letterSpacing: "0.1em", color: "var(--tm-text-faint)", textTransform: "uppercase", fontWeight: 600 }}>CV — {job.company}</span>
      </div>
      <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 44, fontWeight: 700, color, lineHeight: 1, letterSpacing: "-0.02em", filter: `drop-shadow(0 0 8px ${color}50)` }}>
        {fit}<span style={{ fontSize: 22, opacity: 0.7 }}>%</span>
      </div>
      <div style={{ height: 4, borderRadius: 99, background: "var(--tm-border)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${fit}%`, borderRadius: 99, background: color, transition: "width 600ms var(--tm-ease)" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
        <button
          onClick={() => onSpendXP(100, "rewrite_cv_line")}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderRadius: 6, border: "1px solid var(--tm-border)",
            background: "rgba(255,255,255,0.02)", fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit", color: "var(--tm-text-muted)",
          }}
        >
          <span>Rewrite CV line</span>
          <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, fontWeight: 700, color: "var(--tm-accent)" }}>◆ 100 XP</span>
        </button>
        <button
          onClick={() => onSpendXP(50, "download_cv")}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderRadius: 6, border: "1px solid var(--tm-border)",
            background: "rgba(255,255,255,0.02)", fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit", color: "var(--tm-text-muted)",
          }}
        >
          <span>Download tailored CV</span>
          <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, fontWeight: 700, color: "var(--tm-accent)" }}>◆ 50 XP</span>
        </button>
        <Link
          href="/cv"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "10px 14px", borderRadius: 6, background: "var(--tm-accent)",
            color: "var(--tm-accent-fg)", fontSize: 12, fontWeight: 700, textDecoration: "none",
          }}
        >
          Open CV Builder →
        </Link>
      </div>
    </div>
  )
}
