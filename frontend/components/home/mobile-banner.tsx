"use client"

import Link from "next/link"
import "./mobile-banner.css"

interface MobileBannerProps {
  name: string
  score: number
  streak: number
  scoreDelta: number
  loggedToday: boolean
}

/* Compact score dial — score / 100 as a donut, accent arc = progress. */
function ScoreDial({ score }: { score: number }) {
  const size = 44
  const r = (size - 6) / 2
  const c = 2 * Math.PI * r
  const off = c * (1 - Math.max(0, Math.min(100, score)) / 100)
  return (
    <svg className="mb-dial" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle className="track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="3.5" />
      <circle
        className="arc"
        cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="3.5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={off}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text className="num" x="50%" y="50%" dominantBaseline="central" textAnchor="middle">{score}</text>
    </svg>
  )
}

/**
 * Mobile top strip — the greeting is gone (D1); the feed owns the viewport. What
 * remains is the one thing worth pinning: the Myro Score as an *actionable* dial
 * that taps through to the skill map, plus the streak. Sticky, non-snapping.
 */
export function MobileBanner({ score, streak, scoreDelta }: MobileBannerProps) {
  return (
    <div className="mb">
      <Link href="/skills" className="mb-score tm-control-focus" aria-label={`Myro Score ${score} of 100 — open your skill map`}>
        <ScoreDial score={score} />
        <span className="mb-score-meta">
          <span className="mb-score-lab">Myro Score</span>
          <span className="mb-score-sub">
            of 100{scoreDelta > 0 ? <span className="mb-up"> · ▲{scoreDelta}</span> : null}
          </span>
        </span>
      </Link>
      {streak > 0 ? (
        <span className="mb-chip mb-chip--streak" title="Day streak">🔥 {streak}</span>
      ) : null}
    </div>
  )
}
