"use client"

import Link from "next/link"
import "./mobile-banner.css"
import type { NextMove } from "@/lib/mission-control/next-moves"

interface MobileBannerProps {
  name: string
  score: number
  streak: number
  topMove: NextMove | null
}

/**
 * Q6 — mobile-only thin sticky banner that replaces the full desktop Hero so
 * the card feed owns the viewport. Carries the single most important
 * next-move + score chip; everything else folds into the feed and the
 * pull-up index sheet. Non-snapping (scroll-snap-align: none) so it never
 * fights the feed's vertical snap.
 */
export function MobileBanner({ name, score, streak, topMove }: MobileBannerProps) {
  const moveInner = topMove ? (
    <>
      <span className="mb-move-lbl">{topMove.title}</span>
      <span className="mb-move-go" aria-hidden>
        →
      </span>
    </>
  ) : null

  return (
    <div className="mb">
      <div className="mb-top">
        <div className="mb-hi">
          Hi, <strong>{name}</strong>
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

      {topMove ? (
        topMove.href ? (
          <Link href={topMove.href} className="mb-move tm-control-focus">
            {moveInner}
          </Link>
        ) : (
          <button type="button" onClick={topMove.onClick} className="mb-move tm-control-focus">
            {moveInner}
          </button>
        )
      ) : null}
    </div>
  )
}
