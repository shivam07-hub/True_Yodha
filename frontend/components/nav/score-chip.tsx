"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { scores } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import { buildScoreMapHref } from "@/lib/score-map"

/**
 * Quiet Myro Score chip (unified-structure S1, lock #9) — the status the user
 * carries through every stage, always visible in the topbar right cluster. A
 * miniature ring instrument: accent arc over a border track + the mono number.
 * Taps to the canonical Score & Skills explanation surface.
 *
 * Renders nothing until a real score exists — no fake zero, no locked chrome.
 */

const R = 6.5
const CIRC = 2 * Math.PI * R

export function ScoreChip() {
  const { token } = useAuth()
  const { data } = useQuery({
    queryKey: dataKeys.scores(),
    queryFn: () => scores.me(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
    retry: false, // 404 = no CV scored yet — chip simply absent
  })

  const score = data?.total_score
  if (!score || score <= 0) return null
  const shown = Math.round(score)
  const arc = (Math.min(shown, 100) / 100) * CIRC

  return (
    <Link
      href={buildScoreMapHref({ panel: "why" })}
      className="tm-score-chip"
      title={`Myro Score ${shown} — see what moves it`}
      aria-label={`Myro Score ${shown}`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r={R} fill="none" stroke="var(--tm-border)" strokeWidth="2" />
        <circle
          cx="8" cy="8" r={R} fill="none"
          stroke="var(--tm-interactive)" strokeWidth="2" strokeLinecap="round"
          strokeDasharray={`${arc} ${CIRC}`}
          transform="rotate(-90 8 8)"
        />
      </svg>
      <span className="tm-score-chip-num">{shown}</span>
    </Link>
  )
}
