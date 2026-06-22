"use client"

import Link from "next/link"

/**
 * YourMoveCard — the home "your move" nudge for Practice.
 *
 * Practice is a *post-apply* activity (CV-playground grill, 2026-06-22): while a
 * user is still tailoring and applying, surfacing Practice steals attention from
 * the real job. So this nudge appears only once the user has a pursuit at
 * Applied or Interviewing AND a real skill gap to close. Before that — or with
 * no gaps — it renders nothing, leaving the dashboard to its apply-first flow.
 */
interface YourMoveCardProps {
  /** True when at least one pursuit is Applied or Interviewing. */
  hasApplied: boolean
  /** Highest-leverage gap skill (from the score), or null when there are none. */
  topGapSkill: string | null
}

export function YourMoveCard({ hasApplied, topGapSkill }: YourMoveCardProps) {
  // Gate: only a post-apply pursuit with a concrete gap earns the nudge.
  if (!hasApplied || !topGapSkill) return null

  return (
    <div style={{
      position: "relative", overflow: "hidden",
      background: "linear-gradient(120deg, var(--tm-int-bg-wash) 0%, var(--tm-surface) 55%)",
      border: "1px solid var(--tm-int-border)",
      borderLeft: "3px solid var(--tm-interactive)",
      borderRadius: "var(--tm-radius)",
      padding: "14px 18px",
      display: "flex", alignItems: "center", gap: 16,
      marginBottom: 20,
    }}>
      {/* Ambient glow */}
      <div style={{
        position: "absolute", top: 0, left: 0, width: 180, height: "100%",
        background: "radial-gradient(ellipse at 0% 50%, var(--tm-int-bg-wash), transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <div style={{
          textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 10,
          color: "var(--tm-text-faint)", fontFamily: "var(--tm-font-mono)",
        }}>
          Your move
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--tm-text)", marginTop: 2 }}>
          Practice {topGapSkill}
        </div>
        <div style={{ fontSize: 12, color: "var(--tm-text-muted)", marginTop: 2 }}>
          Close the gaps on roles you&rsquo;ve applied to · earn Myro Coins · keeps your streak
        </div>
      </div>

      <Link
        href="/forge"
        className="tm-control-focus"
        style={{
          flexShrink: 0, position: "relative",
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "9px 14px", borderRadius: "var(--tm-radius)",
          background: "var(--tm-interactive)", color: "#fff",
          fontSize: 13, fontWeight: 600, textDecoration: "none",
          fontFamily: "inherit",
        }}
      >
        Enter Practice ↗
      </Link>
    </div>
  )
}
