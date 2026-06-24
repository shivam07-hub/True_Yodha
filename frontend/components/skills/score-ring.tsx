"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRecomputeStore } from "@/store/recomputeStore"
import { tierForScore } from "@/lib/score-tiers"

interface ScoreRingProps {
  score: number
  /**
   * When provided, the ring becomes a disclosure toggle for the personal score
   * breakdown (authed surfaces) instead of linking to the generic /docs method.
   * `expanded` + `controls` wire the button to the panel for assistive tech.
   */
  onExpand?: () => void
  expanded?: boolean
  controls?: string
}

export function ScoreRing({ score, onExpand, expanded, controls }: ScoreRingProps) {
  const R = 26
  const CIRC = 2 * Math.PI * R
  const [offset, setOffset] = useState(CIRC)

  useEffect(() => {
    const id = requestAnimationFrame(() => setOffset(CIRC * (1 - score / 100)))
    return () => cancelAnimationFrame(id)
  }, [score, CIRC])

  const tier = tierForScore(score)
  const recomputing = useRecomputeStore(s => s.pendingBaselineId !== null)

  const rowStyle = { display: "flex", alignItems: "center", gap: 16, flexShrink: 0, color: "inherit", textDecoration: "none" } as const

  const inner = (
    <>
      <svg
        width={68} height={68} viewBox="0 0 68 68"
        aria-busy={recomputing}
        style={{
          flexShrink: 0,
          animation: recomputing ? "tm-score-pulse 1400ms ease-in-out infinite" : "none",
          opacity: recomputing ? 0.7 : 1,
          transition: "opacity 200ms var(--tm-ease)",
        }}
      >
        <circle cx={34} cy={34} r={R} fill="none" stroke="var(--tm-border)" strokeWidth={5} />
        <circle cx={34} cy={34} r={R} fill="none" stroke="var(--data-1)" strokeWidth={5}
          strokeDasharray={CIRC} strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 34 34)"
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.4,0,0.2,1)" }}
        />
        <text x={34} y={39} textAnchor="middle" fontSize={17} fontWeight={700}
          fill="var(--tm-text)" fontFamily="var(--tm-font-mono)">
          {score}
        </text>
      </svg>
      <div>
        <div className="tm-label-caps" style={{ marginBottom: 3 }}>Myro Score</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tm-text)" }}>{tier.label}</div>
        {tier.next !== null && (
          <div style={{ fontSize: 11, color: "var(--tm-text-faint)", marginTop: 3 }}>
            Next <span style={{ color: "var(--data-1)", fontWeight: 600 }}>{tier.next}</span> · {tier.nextLabel}
          </div>
        )}
      </div>
    </>
  )

  // Authed personal surface: ring toggles the breakdown in place.
  if (onExpand) {
    return (
      <button
        type="button"
        onClick={onExpand}
        aria-expanded={expanded}
        aria-controls={controls}
        aria-label={`Myro Score ${score}. ${expanded ? "Hide" : "Show"} how your score is calculated.`}
        className="tm-control-focus"
        style={{ ...rowStyle, background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", textAlign: "left" }}
      >
        {inner}
      </button>
    )
  }

  // Anon / public reuse: link to the generic method.
  return (
    <Link
      href="/docs#scoring"
      aria-label={`Myro Score ${score}. See how this score is calculated.`}
      title="See how this score is calculated"
      style={rowStyle}
    >
      {inner}
    </Link>
  )
}
