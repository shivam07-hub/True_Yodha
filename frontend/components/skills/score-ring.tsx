"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRecomputeStore } from "@/store/recomputeStore"
import { tierForScore } from "@/lib/score-tiers"

export function ScoreRing({ score }: { score: number }) {
  const R = 26
  const CIRC = 2 * Math.PI * R
  const [offset, setOffset] = useState(CIRC)

  useEffect(() => {
    const id = requestAnimationFrame(() => setOffset(CIRC * (1 - score / 100)))
    return () => cancelAnimationFrame(id)
  }, [score, CIRC])

  const tier = tierForScore(score)
  const recomputing = useRecomputeStore(s => s.pendingBaselineId !== null)

  return (
    <Link
      href="/docs#scoring"
      aria-label={`Myro Score ${score}. See how this score is calculated.`}
      title="See how this score is calculated"
      style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0, color: "inherit", textDecoration: "none" }}
    >
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
    </Link>
  )
}
