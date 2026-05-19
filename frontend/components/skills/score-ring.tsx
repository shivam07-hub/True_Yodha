"use client"

import { useState, useEffect } from "react"
import { useRecomputeStore } from "@/store/recomputeStore"

const SCORE_TIERS = [
  { min: 80, label: "Advanced",            next: null, nextLabel: null },
  { min: 60, label: "Competent",           next: 80,   nextLabel: "Advanced" },
  { min: 40, label: "Developing",          next: 60,   nextLabel: "Competent" },
  { min: 20, label: "Emerging",            next: 40,   nextLabel: "Developing" },
  { min: 0,  label: "Building foundation", next: 20,   nextLabel: "Emerging" },
]

export function ScoreRing({ score }: { score: number }) {
  const R = 26
  const CIRC = 2 * Math.PI * R
  const [offset, setOffset] = useState(CIRC)

  useEffect(() => {
    const id = requestAnimationFrame(() => setOffset(CIRC * (1 - score / 100)))
    return () => cancelAnimationFrame(id)
  }, [score, CIRC])

  const tier = SCORE_TIERS.find(t => score >= t.min) ?? SCORE_TIERS[SCORE_TIERS.length - 1]
  const recomputing = useRecomputeStore(s => s.pendingBaselineId !== null)

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
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
        <circle cx={34} cy={34} r={R} fill="none" stroke="var(--tm-accent)" strokeWidth={5}
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
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tm-text)", marginBottom: 3 }}>{tier.label}</div>
        {tier.next !== null && (
          <div style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>
            Next milestone: <span style={{ color: "var(--tm-accent)", fontWeight: 600 }}>{tier.next}</span> — {tier.nextLabel}
          </div>
        )}
      </div>
    </div>
  )
}
