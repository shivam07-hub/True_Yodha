/* Score ring — the results-screen primitive. The level path lives in
   rung-path.tsx now (RungPath); this file keeps only the graded-set ring. */

import type { JSX } from "react"

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
