"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

interface YourMoveCardProps {
  hasCv: boolean
  hasJob: boolean
  loggedToday: boolean
  topGapSkill: string | null
  onForge: () => void
  onDiary: () => void
}

interface MoveConfig {
  tag: string
  headline: string
  sub: string
  xp: string | null
  action: { label: string; onClick?: () => void; href?: string }
}

function resolveMove(
  hasCv: boolean,
  hasJob: boolean,
  loggedToday: boolean,
  topGapSkill: string | null,
  onForge: () => void,
  onDiary: () => void,
): MoveConfig {
  if (!hasCv) {
    return {
      tag: "START HERE",
      headline: "Upload your CV",
      sub: "Unlocks job matching, skill scoring, and XP",
      xp: "+3000 XP",
      action: { label: "Upload CV →", href: "/cv" },
    }
  }
  if (!hasJob) {
    return {
      tag: "STEP 1",
      headline: "Find your target role",
      sub: "See exactly which skills to close to get there",
      xp: null,
      action: { label: "Browse Live Job Data →", href: "/market" },
    }
  }
  if (!loggedToday) {
    const skill = topGapSkill ?? "a gap skill"
    return {
      tag: "YOUR MOVE",
      headline: `Practice ${skill}`,
      sub: "Practice the skill · log the session · earn XP · keeps streak",
      xp: "+50 XP",
      action: { label: "Enter Practice ↗", onClick: onForge },
    }
  }
  return {
    tag: "CLOSE THE LOOP",
    headline: "Log today's work",
    sub: "Lock in your proof · diary entry earns XP · loop complete",
    xp: "+30 XP",
    action: { label: "Open Diary →", onClick: onDiary },
  }
}

export function YourMoveCard({ hasCv, hasJob, loggedToday, topGapSkill, onForge, onDiary }: YourMoveCardProps) {
  const move = resolveMove(hasCv, hasJob, loggedToday, topGapSkill, onForge, onDiary)
  const isComplete = hasCv && hasJob && loggedToday

  if (isComplete) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 16px",
        background: "rgba(34,197,94,0.04)",
        border: "1px solid rgba(34,197,94,0.15)",
        borderRadius: "var(--tm-radius)",
      }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--tm-success, #22c55e)", flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: "var(--tm-success, #22c55e)", fontWeight: 600, fontFamily: "var(--tm-font-mono)", letterSpacing: "0.06em" }}>
          LOOP COMPLETE TODAY ✓
        </span>
        <span style={{ fontSize: 12, color: "var(--tm-text-faint)", marginLeft: 4 }}>
          Come back tomorrow to keep the streak
        </span>
      </div>
    )
  }

  return (
    <div style={{
      position: "relative", overflow: "hidden",
      background: "linear-gradient(120deg, var(--tm-int-bg-wash) 0%, var(--tm-surface) 55%)",
      border: "1px solid var(--tm-int-border)",
      borderLeft: "3px solid var(--tm-interactive)",
      borderRadius: "var(--tm-radius)",
      padding: "14px 18px",
      display: "flex", alignItems: "center", gap: 16,
    }}>
      {/* Ambient glow */}
      <div style={{
        position: "absolute", top: 0, left: 0, width: 180, height: "100%",
        background: "radial-gradient(ellipse at 0% 50%, var(--tm-int-bg-wash), transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <div style={{
          fontFamily: "var(--tm-font-mono)", fontSize: 9, letterSpacing: "0.14em",
          textTransform: "uppercase", color: "var(--tm-interactive)", opacity: 0.7, marginBottom: 4,
        }}>
          {move.tag}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--tm-text)", letterSpacing: "-0.01em", marginBottom: 2 }}>
          {move.headline}
        </div>
        <div style={{ fontSize: 12, color: "var(--tm-text-faint)", lineHeight: 1.4 }}>
          {move.sub}
        </div>
      </div>

      {/* XP badge + CTA */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
        {move.xp && (
          <div style={{
            fontFamily: "var(--tm-font-mono)", fontSize: 13, fontWeight: 700,
            color: "var(--tm-interactive)", letterSpacing: "0.04em",
            background: "var(--tm-int-bg-wash)", border: "1px solid var(--tm-int-border)",
            borderRadius: 99, padding: "2px 10px",
          }}>
            {move.xp} ◆
          </div>
        )}
        {move.action.href ? (
          <Button variant="solid" size="md" render={<Link href={move.action.href} />}>
            {move.action.label}
          </Button>
        ) : (
          <Button variant="solid" size="md" onClick={move.action.onClick}>
            {move.action.label}
          </Button>
        )}
      </div>
    </div>
  )
}
