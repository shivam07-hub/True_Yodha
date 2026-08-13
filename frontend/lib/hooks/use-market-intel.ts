"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { jobs, type JobFeedItem, type JobPulse, type TopCompaniesSort } from "@/lib/api"
import { COMPANY_SIGNAL_FETCH_LIMIT, companySignalRows } from "@/lib/company-signals"

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
 * Who's hiring in the user's location scope (← /jobs/companies-at). Read-only
 * and public — no token, no parsed CV.
 *
 * Skill demand used to live here too, derived from `/jobs/analytics` top_skills.
 * It was removed: that aggregate counts every row in `jobs` regardless of
 * whether the listing is still open, so the rail ranked skills by how many of
 * their postings had died. Skill demand now reads a snapshot with liveness,
 * employer-spread and taxonomy guards — see `useSkillDemand`.
 */
export function useMarketIntel(
  /** From `useFeedScope().city` — this hook does not derive geo, it is handed
   *  the one answer every surface shares. */
  city: string | null,
  companySort: TopCompaniesSort = "roles",
  // Wave-3 gate (#41 L3): must never fire on login. Until the flag is true the
  // query stays disabled and `loading` is false (no eternal skeleton — the
  // widget simply doesn't render yet).
  enabled = true,
) {
  const companies = useQuery({
    queryKey: ["topCompaniesAt", "city", city ?? "", companySort],
    queryFn: () => jobs.topCompaniesAt({ kind: "city", name: city! }, COMPANY_SIGNAL_FETCH_LIMIT, companySort),
    enabled: enabled && !!city,
    staleTime: 30 * 60 * 1000,
  })

  const trending = useMemo<TrendingCompany[]>(
    () => companySignalRows(companies.data?.companies ?? []),
    [companies.data],
  )

  // Disabled with no city (isLoading=false), so this is false when there is
  // nothing left to fetch — no skeleton that never resolves.
  return { trending, loading: companies.isLoading }
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
