"use client"

import { useQuery } from "@tanstack/react-query"
import { jobs, publicStats, type PublicStatsResponse } from "@/lib/api"
import { LANDING_FLOORS, displayCount } from "@/lib/public-stats-display"

/* Chapter 2's live line and company rail. No user count: `/public/stats`
   returns `seekers`, and the landing never shows it (spec #66 §5). */
export interface LandingData {
  stats: PublicStatsResponse | null
  companiesMonitored: number
  /** Real company names from the Engine's corpus, for chapter 2's rail. */
  marqueeNames: string[]
}

const HOUR = 60 * 60 * 1000

export function useLandingData(): LandingData {
  const analyticsQ = useQuery({
    queryKey: ["landing", "analytics"],
    queryFn: () => jobs.analytics(),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  })

  const statsQ = useQuery({
    queryKey: ["landing", "public-stats"],
    queryFn: () => publicStats.get(),
    staleTime: HOUR,
    // One hour of identity: do not re-hit /public/stats on every mount/focus.
    // The endpoint is cached server-side, but a tab stampede still burns the
    // shared Free/Nano connection budget before Cache-Control can help.
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  const analytics = analyticsQ.data ?? null
  const stats = statsQ.data ?? null

  return {
    stats,
    companiesMonitored: displayCount(
      stats?.companies_monitored ?? analytics?.total_companies,
      LANDING_FLOORS.companies,
      10,
    ),
    marqueeNames: (analytics?.by_company ?? []).slice(0, 24).map((c) => c.name),
  }
}
