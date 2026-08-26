"use client"

import { useQuery } from "@tanstack/react-query"

import { publicStats, type PublicIndustryGroup } from "@/lib/api"
import { LANDING_FLOORS, displayCount } from "@/lib/public-stats-display"

/* The "myro live data" half of Myrology.
 *
 * Every teal number on /myrology resolves through here, so the page can never
 * state a market fact the index has not actually produced. The chart half is
 * cast from what the visitor types; these two are labelled apart and never
 * averaged (BACKLOG two-lens guardrail).
 *
 * Shares the landing page's query key on purpose: a visitor who arrives from /
 * reuses that hour-old payload instead of re-hitting the endpoint. */

const HOUR = 60 * 60 * 1000

export interface MarketLens {
  /** Floored open-role count, matching how / and /newsletter render it. */
  jobsTracked: number
  /** Top groups by open count, descending. Empty until the query resolves. */
  industryGroups: PublicIndustryGroup[]
  /** Groups in the normalised taxonomy — not the length of `industryGroups`. */
  totalIndustries: number
  roleFamilies: number
  /** When the index was compiled, not when this request was served. */
  asOf: string | null
  /** The open-role count has landed. */
  ready: boolean
  /** The taxonomy widths are present AND non-zero.
   *
   *  Separate from `ready` on purpose. A backend older than these fields — or
   *  an hour-old cached payload built before they shipped — still answers with
   *  a perfectly good job count, and the shape check has to be per-field or the
   *  page prints "across 0 groups and 0 role families" as though that were a
   *  finding. An index with zero industry groups is not a fact we would ever
   *  want to state; absent and zero are the same answer here. */
  taxonomyReady: boolean
}

export function useMarketLens(): MarketLens {
  const statsQ = useQuery({
    queryKey: ["landing", "public-stats"],
    queryFn: () => publicStats.get(),
    staleTime: HOUR,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  const stats = statsQ.data ?? null
  const totalIndustries = stats?.total_industries ?? 0
  const roleFamilies = stats?.role_families ?? 0

  return {
    jobsTracked: displayCount(stats?.jobs_tracked, LANDING_FLOORS.jobs, 100),
    industryGroups: stats?.industry_groups ?? [],
    totalIndustries,
    roleFamilies,
    asOf: stats?.as_of ?? null,
    ready: stats !== null,
    taxonomyReady: totalIndustries > 0 && roleFamilies > 0,
  }
}
