"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { jobs, type JobFeedItem, type JobPulse } from "@/lib/api"

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
}

/** A listing the community is unsure about — surfaced for a verify vote. */
export interface UncertainListing {
  job: JobFeedItem
  confidence: "uncertain" | "likely_closed" | "closed"
}

/**
 * Market-intel signals for the /market rail + interleaved story cards. All
 * read-only, all from endpoints that already exist (no new backend):
 *   movers   ← /jobs/my-skills/demand   (the core market lesson)
 *   trending ← /jobs/companies-at       (who's hiring in the user's city)
 * Query keys mirror the page's existing ones so React Query dedupes the fetch.
 */
export function useMarketIntel(token: string, targetLocations: string[]) {
  const demand = useQuery({
    queryKey: ["mySkillDemand", token],
    queryFn: () => jobs.mySkillDemand(token),
    enabled: !!token,
    staleTime: 30 * 60 * 1000,
  })

  const city = targetLocations.find((l) => l && l.trim())?.trim() ?? null
  const companies = useQuery({
    queryKey: ["topCompaniesAt", "city", city ?? ""],
    queryFn: () => jobs.topCompaniesAt({ kind: "city", name: city! }),
    enabled: !!city,
    staleTime: 30 * 60 * 1000,
  })

  const movers = useMemo<SkillMover[]>(
    () =>
      (demand.data?.skills ?? [])
        .filter((s) => s.job_count_30d > 0)
        .slice()
        .sort((a, b) => b.job_count_30d - a.job_count_30d)
        .slice(0, 5)
        .map((s) => ({
          skill: s.skill,
          display: s.display_name,
          jobCount: s.job_count_30d,
          level: s.current_level,
          needsUpgrade: s.needs_upgrade,
        })),
    [demand.data],
  )

  const trending = useMemo<TrendingCompany[]>(
    () =>
      (companies.data?.companies ?? [])
        .slice(0, 4)
        .map((c) => ({ name: c.company_name, openCount: c.open_count })),
    [companies.data],
  )

  return { movers, trending, loading: demand.isLoading }
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
