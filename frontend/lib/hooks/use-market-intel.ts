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
export function useMarketIntel(token: string, targetLocations: string[], cvReady = true) {
  // Location-scoped demand: each mover links into the location-scoped triage
  // feed, so its badge must promise that feed (Scoped Skill Demand). Distinct
  // query key from the market-wide ["mySkillDemand", token] used elsewhere.
  // Gated on cvReady — movers are the user's own skills × market, so with no
  // parsed CV the endpoint returns []; firing it anyway only paints a skeleton
  // that resolves to a silently-empty widget (mirrors the page's own demand
  // gate). No CV → no query, no false promise; trending (public) still shows.
  const demand = useQuery({
    queryKey: ["mySkillDemand", token, "scoped"],
    queryFn: () => jobs.mySkillDemand(token, { locationScoped: true }),
    enabled: !!token && cvReady,
    staleTime: 30 * 60 * 1000,
  })

  const city = targetLocations.find((l) => l && l.trim())?.trim() ?? null
  const companies = useQuery({
    queryKey: ["topCompaniesAt", "city", city ?? ""],
    queryFn: () => jobs.topCompaniesAt({ kind: "city", name: city! }),
    enabled: !!city,
    staleTime: 30 * 60 * 1000,
  })

  // Scoped count is the badge's promise. Fall back to the market-wide count
  // only if a row is missing the scoped figure (e.g. outside the top-N the
  // backend scopes) — never show a skill with zero in-scope roles.
  const scopedCount = (s: { scoped_job_count?: number | null; job_count_30d: number }) =>
    s.scoped_job_count ?? s.job_count_30d
  const movers = useMemo<SkillMover[]>(
    () =>
      (demand.data?.skills ?? [])
        .filter((s) => scopedCount(s) > 0)
        .slice()
        .sort((a, b) => scopedCount(b) - scopedCount(a))
        .slice(0, 5)
        .map((s) => ({
          skill: s.skill,
          display: s.display_name,
          jobCount: scopedCount(s),
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

  // Both widgets share one shimmer; fold the companies query in so trending
  // resolving slower than demand doesn't blank out under a finished spinner.
  // Disabled queries (no token/cv, no city) report isLoading=false, so this is
  // false when there's nothing to fetch.
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
