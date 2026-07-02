"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { jobs, type JobFeedItem, type JobPulse, type TopCompaniesSort } from "@/lib/api"
import { COMPANY_SIGNAL_FETCH_LIMIT, companySignalRows } from "@/lib/company-signals"

/** A skill the market is asking for, ranked by 30-day job demand. */
export interface SkillMover {
  skill: string
  display: string
  jobCount: number
  level: number
  needsUpgrade: boolean
}

/** A company hiring in the user's location scope. */
export interface TrendingCompany {
  name: string
  openCount: number
  lastSeenAt: string | null
}

/** A listing the community is unsure about — surfaced for a verify vote. */
export interface UncertainListing {
  job: JobFeedItem
  confidence: "uncertain" | "likely_closed" | "closed"
}

/**
 * Market-intel signals for the /market rail + interleaved story cards. All
 * read-only, all public (no token, no parsed CV):
 *   movers   ← /jobs/analytics top_skills (universal market demand, city-scoped)
 *   trending ← /jobs/companies-at         (who's hiring in the user's city)
 */
export function useMarketIntel(targetLocations: string[], companySort: TopCompaniesSort = "roles") {
  const city = targetLocations.find((l) => l && l.trim())?.trim() ?? null

  // Skill-demand movers = the market overall, NOT the user's CV. Universal and
  // identical for every viewer: the most-demanded skills across active jobs,
  // scoped to the rail's city. Reads the public /jobs/analytics aggregate
  // (top_skills), so it needs no token and no parsed CV — that CV gate was the
  // root cause of the rail's stuck "movers" skeleton for CV-less users.
  const demand = useQuery({
    queryKey: ["marketTopSkills", city ?? ""],
    queryFn: () => jobs.analytics(null, { locationCity: city }),
    staleTime: 30 * 60 * 1000,
  })
  const companies = useQuery({
    queryKey: ["topCompaniesAt", "city", city ?? "", companySort],
    queryFn: () => jobs.topCompaniesAt({ kind: "city", name: city! }, COMPANY_SIGNAL_FETCH_LIMIT, companySort),
    enabled: !!city,
    staleTime: 30 * 60 * 1000,
  })

  // top_skills is already sorted desc by active-job count and city-scoped by the
  // endpoint; take the top 5 with a real count. skill == the feed's skill-facet
  // value, so each mover's button filters the feed to exactly what its badge
  // counts. level/needsUpgrade are CV-relative and unused here (universal view).
  const movers = useMemo<SkillMover[]>(
    () =>
      (demand.data?.top_skills ?? [])
        .filter((s) => s.count > 0)
        .slice(0, 5)
        .map((s) => ({
          skill: s.skill,
          display: s.skill,
          jobCount: s.count,
          level: 0,
          needsUpgrade: false,
        })),
    [demand.data],
  )

  const trending = useMemo<TrendingCompany[]>(
    () => companySignalRows(companies.data?.companies ?? []),
    [companies.data],
  )

  // Both widgets share one shimmer; fold the companies query in so trending
  // resolving slower than demand doesn't blank out under a finished spinner.
  // The companies query is disabled with no city (isLoading=false), so this is
  // false when there's nothing left to fetch.
  return { movers, trending, loading: demand.isLoading || companies.isLoading }
}

/** Listings in the visible feed the community flags as possibly gone. */
export function uncertainListings(
  feed: JobFeedItem[],
  pulses: Map<string, JobPulse>,
  cap = 3,
): UncertainListing[] {
  const out: UncertainListing[] = []
  for (const job of feed) {
    const c = pulses.get(job.job_id)?.listing_confidence
    if (c === "uncertain" || c === "likely_closed" || c === "closed") {
      out.push({ job, confidence: c })
      if (out.length >= cap) break
    }
  }
  return out
}
