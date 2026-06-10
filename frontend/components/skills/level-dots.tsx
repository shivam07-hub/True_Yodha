"use client"

interface Props {
  /** Current achieved level. 0..5. Displayed as that many filled dots. */
  level: number
  /** Accepted for call-site compatibility; no longer drives any animation. */
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
 * 5-dot level indicator. First `level` dots are solid accent; the rest are dim.
 * Static — the time-based forge progress fill was removed with the forge timer
 * (leveling now comes from Upskilling clears, DEC-1a).
 */
export function LevelDots({
  level,
  total = 5,
  size = 8,
  gap = 4,
  color = "var(--tm-interactive)",
}: Props) {
  const clampedLevel = Math.max(0, Math.min(total, Math.floor(level)))

  return (
    <span
      role="img"
      aria-label={`Level ${clampedLevel} of ${total}`}
      style={{ display: "inline-flex", alignItems: "center", gap }}
    >
      {Array.from({ length: total }).map((_, i) => {
        const filled = i < clampedLevel
        return (
          <span
            key={i}
            style={{
              width: size,
              height: size,
              borderRadius: "50%",
              background: filled ? color : "var(--tm-border)",
              flexShrink: 0,
            }}
          />
        )
      })}
    </span>
  )
}
