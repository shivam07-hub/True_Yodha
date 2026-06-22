"use client"

import { useQuery } from "@tanstack/react-query"
import { jobs, publicStats, type MarketAnalytics, type PublicStatsResponse } from "@/lib/api"

/* Static floors — verified Engine-corpus values confirmed in the design handoff
   (DEC-L2). Rendered whenever live data is unavailable; live values are floored
   so the public numbers only ever grow. These describe the SCRAPED CORPUS (jobs,
   companies, skills) — real engine scale, safe to floor.
   NOTE: there is deliberately NO `seekers` floor here. The user count is real-
   but-small (<400) and must never be inflated into fake social proof (PV1 /
   no-fabrication). See `seekers` below — it is env-gated, not floored. */
export const LANDING_FLOORS = {
  jobs: 4000,
  companies: 150,
  skills: 32000,
} as const

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

export function floorTo(n: number, step: number): number {
  return Math.floor(n / step) * step
}

/** Floored live value, never below the verified static floor. */
export function displayCount(live: number | null | undefined, floor: number, step: number): number {
  if (typeof live === "number" && Number.isFinite(live) && live > 0) {
    return Math.max(floor, floorTo(live, step))
  }
  return floor
}

export interface IntelTeaserRow {
  company: string
  count: number
  topSkill: string | null
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
  intelRows: IntelTeaserRow[]
  asOf: Date | null
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

  const topCompanies = (analytics?.by_company ?? []).slice(0, 3)
  const topNames = topCompanies.map((c) => c.name)

  const topSkillsQ = useQuery({
    queryKey: ["landing", "top-skills", topNames.join("|")],
    enabled: topNames.length > 0,
    staleTime: HOUR,
    retry: 0,
    queryFn: () =>
      Promise.all(
        topNames.map((name) =>
          jobs
            .analyticsEntitySkills(name, "company")
            .then((r) => r.skills[0]?.skill ?? null)
            .catch(() => null),
        ),
      ),
  })

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

  const asOfRaw = stats?.as_of ?? analytics?.latest_batch ?? null
  let asOf: Date | null = null
  if (asOfRaw) {
    const parsed = new Date(asOfRaw)
    if (!Number.isNaN(parsed.getTime())) asOf = parsed
  }

  return {
    analytics,
    stats,
    companiesLabel: `${companiesMonitored}+`,
    jobsTracked,
    companiesMonitored,
    skillsMapped,
    seekers,
    marqueeNames: (analytics?.by_company ?? []).slice(0, 24).map((c) => c.name),
    intelRows: topCompanies.map((c, i) => ({
      company: c.name,
      count: c.count,
      topSkill: topSkillsQ.data?.[i] ?? null,
    })),
    asOf,
  }
}
