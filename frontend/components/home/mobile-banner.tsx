"use client"

import "./mobile-banner.css"
import { adaptiveGreeting } from "@/lib/mission-control/greeting"

interface MobileBannerProps {
  name: string
  score: number
  streak: number
  scoreDelta: number
  loggedToday: boolean
}

/**
 * Q6 — mobile-only thin sticky banner that replaces the full desktop Hero so
 * the card feed owns the viewport. Carries the state-aware greeting + score/
 * streak chips; everything else folds into the feed and the pull-up index sheet.
 * Non-snapping (scroll-snap-align: none) so it never fights the feed's vertical
 * snap. No prescriptive next-move — show-not-tell; the feed itself is the action.
 */
export function MobileBanner({ name, score, streak, scoreDelta, loggedToday }: MobileBannerProps) {
  const greeting = adaptiveGreeting({ streak, scoreDelta, loggedToday })

  return (
    <div className="mb">
      <div className="mb-top">
        <div className="mb-hi">
          {greeting.text}, <strong>{name}</strong>
          {greeting.emoji ? <span aria-hidden> {greeting.emoji}</span> : null}
        </div>
        <div className="mb-stats">
          <span className="mb-chip" title="Myro Score">
            {score}
          </span>
          {streak > 0 ? (
            <span className="mb-chip mb-chip--streak" title="Day streak">
              🔥 {streak}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
