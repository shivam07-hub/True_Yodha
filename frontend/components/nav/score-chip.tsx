"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { scores, type ScoreResponse } from "@/lib/api"
import { dataKeys, invalidateScoreData } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import { buildScoreMapHref } from "@/lib/score-map"
import { readIdentitySnapshot, writeIdentitySnapshot } from "@/lib/identity-cache"
import { SCORE_FORMULA_VERSION, standingLine } from "@/lib/score-methodology"

/**
 * Quiet Myro Score chip — number + standing in the topbar. Recalculate sits
 * beside it (never nested) only while the stored total is still the old
 * equal-domain mean.
 */

const R = 6.5
const CIRC = 2 * Math.PI * R

export function ScoreChip() {
  const { token } = useAuth()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const [reveal, setReveal] = useState<{ from: number; to: number } | null>(null)
  const snapshot = useMemo(
    () => readIdentitySnapshot<ScoreResponse>("score", token),
    [token],
  )
  const { data, isFetching } = useQuery({
    queryKey: dataKeys.scores(),
    queryFn: () => scores.me(token!),
    enabled: !!token && pathname !== "/market",
    staleTime: 5 * 60 * 1000,
    retry: false,
    initialData: snapshot?.data,
    initialDataUpdatedAt: snapshot?.ts,
  })
  useEffect(() => {
    if (data) writeIdentitySnapshot("score", token, data)
  }, [data, token])

  const recompute = useMutation({
    mutationFn: () => scores.compute(token!),
    onSuccess: (next) => {
      const from = Math.round(data?.total_score ?? next.total_score)
      setReveal({ from, to: Math.round(next.total_score) })
      queryClient.setQueryData(dataKeys.scores(), next)
      writeIdentitySnapshot("score", token, next)
      invalidateScoreData(queryClient)
    },
  })

  const score = data?.total_score
  if (!score || score <= 0) return null
  const shown = Math.round(score)
  const arc = (Math.min(shown, 100) / 100) * CIRC
  const refreshing = isFetching && !!data
  const standing = standingLine(data.top_percent, data.band)
  const stale = (data.version ?? 1) < SCORE_FORMULA_VERSION
  const label = reveal
    ? `Myro Score ${reveal.from} to ${reveal.to}`
    : standing
      ? `Myro Score ${shown}, ${standing}`
      : `Myro Score ${shown}`

  return (
    <div className="tm-score-chip-wrap">
      <Link
        href={buildScoreMapHref({ panel: "why" })}
        className={`tm-score-chip${refreshing ? " tm-score-chip--refreshing" : ""}`}
        title={refreshing ? `${label} — refreshing…` : `${label} — see what moves it`}
        aria-label={label}
      >
        <svg className="tm-score-chip-ring" width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <circle cx="8" cy="8" r={R} fill="none" stroke="var(--tm-border)" strokeWidth="2" />
          <circle
            cx="8" cy="8" r={R} fill="none"
            stroke="var(--tm-interactive)" strokeWidth="2" strokeLinecap="round"
            strokeDasharray={`${arc} ${CIRC}`}
            transform="rotate(-90 8 8)"
          />
        </svg>
        <span className="tm-score-chip-num">
          {reveal ? `${reveal.from}→${reveal.to}` : shown}
        </span>
        {standing ? <span className="tm-score-chip-stand">{standing}</span> : null}
      </Link>
      {stale && token ? (
        <button
          type="button"
          className="tm-score-recalc"
          disabled={recompute.isPending}
          onClick={() => recompute.mutate()}
        >
          {recompute.isPending ? "Recalculating…" : "Recalculate"}
        </button>
      ) : null}
    </div>
  )
}
