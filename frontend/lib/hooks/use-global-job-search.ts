"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { jobs, type GlobalJobHit } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"

const DEBOUNCE_MS = 200
const STALE_TIME_MS = 60_000

export interface UseGlobalJobSearchResult {
  query: string
  debouncedQuery: string
  isActive: boolean
  isLoading: boolean
  hits: GlobalJobHit[]
}

/**
 * Debounced global job search. Returns the latest hits from /jobs/search/global.
 *
 * Stays idle until the trimmed debounced query is at least `minLength` chars.
 * 60s TanStack cache + in-flight de-dupe keep concurrent typing across a 10K-user
 * surface bounded to a few rps per unique term. The backend pairs this with a
 * pg_trgm GIN index on job_title and a 60s in-process cache for the same window.
 */
export function useGlobalJobSearch(
  query: string,
  opts: { limit?: number; minLength?: number } = {},
): UseGlobalJobSearchResult {
  const limit = opts.limit ?? 12
  const minLength = opts.minLength ?? 2
  const [debounced, setDebounced] = useState(query)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [query])

  const term = debounced.trim()
  const isActive = term.length >= minLength

  const { data, isFetching } = useQuery({
    queryKey: dataKeys.globalJobSearch(term, limit),
    queryFn: () => jobs.globalSearch(term, limit),
    enabled: isActive,
    staleTime: STALE_TIME_MS,
  })

  return {
    query,
    debouncedQuery: term,
    isActive,
    isLoading: isActive && isFetching,
    hits: data?.hits ?? [],
  }
}
