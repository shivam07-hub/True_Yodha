"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { jobs, type CompanyPulseItem } from "@/lib/api"

/**
 * Demand pulse for a set of companies (Signal Thread S2). One batched read for
 * the whole set — NOT a per-company fan-out (the IH3 lesson). Keyed on the
 * company SET so reordering the followed list doesn't refetch. Public data, no
 * token. Returns a by-name lookup so callers render in their own order.
 */
export function useCompanyPulse(companies: string[]) {
  const key = useMemo(() => [...companies].sort(), [companies])
  const query = useQuery({
    queryKey: ["companyPulse", key.join("|")],
    queryFn: () => jobs.companyPulse(companies),
    enabled: companies.length > 0,
    staleTime: 30 * 60 * 1000,
  })
  const byName = useMemo(() => {
    const map = new Map<string, CompanyPulseItem>()
    for (const c of query.data?.companies ?? []) map.set(c.company_name, c)
    return map
  }, [query.data])

  return { byName, loading: query.isLoading }
}
