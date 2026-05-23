"use client"

import { LevelDots } from "./level-dots"

export type ForgeChipState = "idle" | "cart" | "active" | "done"

interface Props {
  skillName: string
  level: number
  sessionsToNext: number
  state: ForgeChipState
  onClick?: () => void
  /** Hide the label on small viewports — useful for cramped rows. */
  compact?: boolean
  ariaLabel?: string
}

const STATE_TOKENS: Record<ForgeChipState, { fg: string; border: string; bg: string }> = {
  idle:   { fg: "var(--tm-accent)",  border: "var(--tm-accent-ring)",    bg: "transparent" },
  cart:   { fg: "var(--tm-accent-fg)", border: "var(--tm-accent)",       bg: "var(--tm-accent)" },
  active: { fg: "var(--tm-warning)", border: "var(--tm-warning-border)", bg: "var(--tm-warning-wash)" },
  done:   { fg: "var(--tm-success)", border: "var(--tm-success-border)", bg: "var(--tm-success-wash)" },
}

function labelFor(state: ForgeChipState, sessionsToNext: number, atMax: boolean): string {
  if (atMax) return "Maxed"
  if (state === "done") return "Dominated"
  if (state === "active") return "Forging…"
  if (state === "cart") return `Locked · ${sessionsToNext} ses`
  return `Lock in · ${sessionsToNext} ses`
}

/**
 * Unified skill action chip. Replaces mc-lock-btn / mc-dominate-btn.
 *
 * State funnel:
 *   idle  → user has not staged this skill yet
 *   cart  → user added it to their forge cart (selection only)
 *   active → a forge session for this skill is currently ticking
 *   done  → skill is at max level
 *
 * All states render LevelDots so the user always sees position on the
 * 5-step ladder. The chip + dots is the *only* skill-progression primitive
 * across mission-control + skill-card. Don't introduce a fourth.
 */
export function ForgeChip({
  skillName,
  level,
  sessionsToNext,
  state,
  onClick,
  compact = false,
  ariaLabel,
}: Props) {
  const atMax = level >= 5
  const tokens = STATE_TOKENS[atMax ? "done" : state]
  const label = labelFor(state, sessionsToNext, atMax)
  const disabled = atMax || state === "done"

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? `${skillName} — ${label}`}
      title={ariaLabel ?? `${skillName} — ${label}`}
      className="tm-forge-chip"
      data-state={atMax ? "done" : state}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "5px 10px 5px 8px",
        borderRadius: 999,
        border: `1px solid ${tokens.border}`,
        background: tokens.bg,
        color: tokens.fg,
        fontFamily: "var(--tm-font-mono)",
        fontSize: 11,
        fontWeight: 700,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.75 : 1,
        whiteSpace: "nowrap",
        transition: "background 160ms var(--tm-ease), border-color 160ms var(--tm-ease)",
      }}
    >
      <LevelDots
        level={level}
        skillName={skillName}
        size={6}
        gap={3}
        color={tokens.fg}
      />
      {state === "active" && (
        <span aria-hidden style={{
          width: 6, height: 6, borderRadius: 999, background: tokens.fg,
          animation: "tm-forge-pulse 1.4s var(--tm-ease) infinite",
        }} />
      )}
      <span className="tm-forge-chip-label" style={{ display: compact ? "none" : "inline" }}>
        {label}
      </span>
      <style>{`
        @keyframes tm-forge-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
        @media (max-width: 480px) {
          .tm-forge-chip-label { display: none !important; }
        }
      `}</style>
    </button>
  )
}
