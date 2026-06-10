/* Level ladder + score ring — the two visual primitives of the Upskilling
   surface. Ported from the design handoff (bars variant only). */

import type { JSX } from "react"
import { Icon } from "./icons"

/* ── 5-segment level ladder ────────────────────────────────────
   Levels L1..L5. cleared ≤ clearedLevel = ✓. next = clearedLevel+1 (CTA).
   higher = locked. onStart(level) fires when the "next" segment is activated,
   but only when its bank is servable (level ≤ maxBankLevel). */
export function LevelLadder({
  clearedLevel,
  onStart,
  compact = false,
  maxBankLevel = 5,
}: {
  clearedLevel: number
  onStart?: (level: number) => void
  compact?: boolean
  maxBankLevel?: number
}): JSX.Element {
  const next = Math.min(clearedLevel + 1, 5)
  return (
    <div
      className={`up-ladder${compact ? " is-compact" : ""}`}
      role="group"
      aria-label={`Level ladder — cleared ${clearedLevel} of 5`}
    >
      {[1, 2, 3, 4, 5].map((lvl) => {
        const cleared = lvl <= clearedLevel
        const isNext = lvl === next && clearedLevel < 5
        const bankOk = lvl <= maxBankLevel
        const cls = cleared ? "is-cleared" : isNext ? "is-next" : "is-locked"
        const label = cleared
          ? `Level ${lvl} cleared`
          : isNext ? `Start Level ${lvl} set` : `Level ${lvl} locked`
        const title = cleared
          ? `L${lvl} · cleared`
          : isNext ? `L${lvl} · next — start a set` : `L${lvl} · locked`
        if (isNext && onStart && bankOk) {
          return (
            <button
              key={lvl} type="button" className={`up-ladder-seg ${cls}`}
              title={title} aria-label={label} onClick={() => onStart(lvl)}
            >
              <span className="seg-lvl">L{lvl}</span>
              <span className="seg-mark"><Icon name="bolt" size={compact ? 11 : 13} /></span>
            </button>
          )
        }
        return (
          <div key={lvl} className={`up-ladder-seg ${cls}`} title={title} aria-label={label}>
            <span className="seg-lvl">L{lvl}</span>
            <span className="seg-mark">
              {cleared ? <Icon name="check" size={compact ? 11 : 13} /> : <Icon name="lock" size={compact ? 10 : 12} />}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ── Score ring (results) ──────────────────────────────────── */
export function ScoreRing({
  score,
  max = 10,
  cleared,
}: {
  score: number
  max?: number
  cleared: boolean
}): JSX.Element {
  const R = 34
  const C = 2 * Math.PI * R
  const size = 84
  const pct = max > 0 ? score / max : 0
  const color = cleared ? "var(--tm-interactive)" : "var(--tm-text-disabled)"
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="up-res-ring">
      <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="var(--tm-surface-2)" strokeWidth="7" />
      <circle
        cx={size / 2} cy={size / 2} r={R} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.4,0,0.2,1)" }}
      />
      <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fontSize="22" fontWeight="750" fill="var(--tm-text)" fontFamily="var(--tm-font-mono)">{score}</text>
      <text x={size / 2} y={size / 2 + 15} textAnchor="middle" fontSize="11" fill="var(--tm-text-faint)" fontFamily="var(--tm-font-mono)">/ {max}</text>
    </svg>
  )
}
