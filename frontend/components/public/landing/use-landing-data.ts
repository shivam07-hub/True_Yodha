"use client"

import { useQuery } from "@tanstack/react-query"
import { jobs, publicStats, type MarketAnalytics, type PublicStatsResponse } from "@/lib/api"
import { LANDING_FLOORS, displayCount } from "@/lib/public-stats-display"

/* Floors + flooring helpers live in a plain module so the server-rendered
   newsletter rail shares them (a "use client" file can't be imported by a
   server component). Re-exported here for existing consumers. */
export { LANDING_FLOORS, floorTo, displayCount } from "@/lib/public-stats-display"

/* T3 social proof — honest by construction. We do NOT auto-publish the live
   user count (small + reveals traction) and we NEVER hardcode a fake "10,000+".
   The seeker number renders ONLY when a deploy explicitly sets a real value via
   NEXT_PUBLIC_SEEKERS_COUNT. Unset (the default) → no number; the stats strip
   falls back to non-numeric proof. Returns null when no real value is set. */
function configuredSeekerCount(): number | null {
  const raw = process.env.NEXT_PUBLIC_SEEKERS_COUNT
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
}

export interface LandingData {
  analytics: MarketAnalytics | null
  stats: PublicStatsResponse | null
  /** "150+" — single-sourced company count (handoff priority directive). */
  companiesLabel: string
  jobsTracked: number
  companiesMonitored: number
  skillsMapped: number
  /** Real seeker count to display, or null when none is configured (T3 — never
   *  fabricated; gated on NEXT_PUBLIC_SEEKERS_COUNT). null → non-numeric proof. */
  seekers: number | null
  /** Real company names from the Engine's corpus, for the hero marquee. */
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
    retry: 1,
  })

  const analytics = analyticsQ.data ?? null
  const stats = statsQ.data ?? null

  const jobsTracked = displayCount(
    stats?.jobs_tracked ?? analytics?.total_jobs,
    LANDING_FLOORS.jobs,
    100,
  )
  const companiesMonitored = displayCount(
    stats?.companies_monitored ?? analytics?.total_companies,
    LANDING_FLOORS.companies,
    10,
  )
  const skillsMapped = displayCount(stats?.skills_mapped, LANDING_FLOORS.skills, 1000)
  const seekers = configuredSeekerCount()

  return {
    analytics,
    stats,
    companiesLabel: `${companiesMonitored}+`,
    jobsTracked,
    companiesMonitored,
    skillsMapped,
    seekers,
    marqueeNames: (analytics?.by_company ?? []).slice(0, 24).map((c) => c.name),
  }
}
