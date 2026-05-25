"use client"

import { useForgeTimerStore } from "@/store/forgeTimerStore"

const SESSION_MINUTES = 25

interface Props {
  /** Current achieved level. 0..5. Displayed as that many filled dots. */
  level: number
  /** Skill name. When equal to the actively-forging skill, the next dot animates. */
  skillName?: string | null
  /** Total dots. Defaults to 5. */
  total?: number
  /** Pixel size of each dot. */
  size?: number
  /** Gap between dots. */
  gap?: number
  /** Color override for filled dots. */
  color?: string
}

/**
 * 5-dot level indicator.
 * - First `level` dots: solid accent.
 * - If `skillName` matches the actively-forging skill in the timer store,
 *   the next dot renders a partial fill = elapsed / FORGE_AMBIENT_DURATION.
 * - Otherwise dots after `level` are dim.
 *
 * Stays consistent across mobile + desktop. The forging-progress fill is the
 * only motion — everything else is static.
 */
export function LevelDots({
  level,
  skillName = null,
  total = 5,
  size = 8,
  gap = 4,
  color = "var(--tm-interactive)",
}: Props) {
  const activeSkill = useForgeTimerStore(s => s.skillName)
  const pendingMinutes = useForgeTimerStore(s => s.pendingMinutes)
  const sessionActive = useForgeTimerStore(s => s.sessionActive)

  const isForgingThis =
    !!skillName &&
    !!activeSkill &&
    sessionActive &&
    skillName.toLowerCase() === activeSkill.toLowerCase()

  const forgingPct = isForgingThis
    ? Math.min(100, (pendingMinutes / SESSION_MINUTES) * 100)
    : 0

  const clampedLevel = Math.max(0, Math.min(total, Math.floor(level)))

  return (
    <span
      role="img"
      aria-label={`Level ${clampedLevel} of ${total}`}
      style={{ display: "inline-flex", alignItems: "center", gap }}
    >
      {Array.from({ length: total }).map((_, i) => {
        const filled = i < clampedLevel
        const isNextDot = i === clampedLevel && isForgingThis
        return (
          <span
            key={i}
            style={{
              width: size,
              height: size,
              borderRadius: "50%",
              background: filled ? color : "var(--tm-border)",
              position: "relative",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {isNextDot && (
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  background: color,
                  clipPath: `inset(${100 - forgingPct}% 0 0 0)`,
                  transition: "clip-path 600ms var(--tm-ease)",
                }}
              />
            )}
          </span>
        )
      })}
    </span>
  )
}
