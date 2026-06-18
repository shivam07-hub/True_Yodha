"use client"

import Link from "next/link"
import "./mobile-banner.css"

interface MobileBannerProps {
  name: string
  score: number
  streak: number
  scoreDelta: number
  loggedToday: boolean
  sessions: number
}

/**
 * Mobile top strip — a thin, glanceable STAT line, not a ring (market-feed
 * redesign 2026-06-18). The circular dial used to eat the whole first viewport
 * before any job; the feed owns the viewport now. Score · streak · sessions sit
 * on one hairline row that taps through to the skill map. Orange is spent only
 * on the score number (the accent budget); everything else is muted. Its old
 * duty as the *sole* door to /skills moved to the account sheet, so this is now
 * purely a stat — free to be small. Sticky, non-snapping. Desktop never renders
 * this (home/market branch on useViewport).
 */
export function MobileBanner({ score, streak, scoreDelta, sessions }: MobileBannerProps) {
  return (
    <Link
      href="/skills"
      className="mb tm-control-focus"
      aria-label={`Myro Score ${score} of 100${scoreDelta > 0 ? `, up ${scoreDelta}` : ""} — open your skill map`}
    >
      <span className="mb-stat mb-stat--score">
        <span className="mb-lab">Score</span>
        <span className="mb-val">{score}</span>
        {scoreDelta > 0 ? <span className="mb-up" aria-hidden>↗{scoreDelta}</span> : null}
      </span>
      {streak > 0 ? (
        <span className="mb-stat">
          <span className="mb-ico" aria-hidden>🔥</span>
          <span className="mb-val mb-val--muted">{streak}</span>
        </span>
      ) : null}
      <span className="mb-stat">
        <span className="mb-val mb-val--muted">{sessions}</span>
        <span className="mb-lab">{sessions === 1 ? "session" : "sessions"}</span>
      </span>
      <span className="mb-go" aria-hidden>›</span>
    </Link>
  )
}
