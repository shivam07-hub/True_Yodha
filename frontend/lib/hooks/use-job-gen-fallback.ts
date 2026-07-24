/**
 * Backlog #33 — job-gen thin-market fallback.
 *
 * The live Intel search (useGlobalJobSearch) is a fast, unlimited trigram
 * lookup with no location-aware relaxation — when it comes up empty, the NL
 * `/public/job-search` endpoint already does the real work (parses the query,
 * relaxes location if the strict match is too thin, never fabricates — see
 * repositories/jobs.py `public_job_query`). This hook wires that existing,
 * previously-orphaned endpoint in as the empty-state fallback, without
 * touching the primary search: `/public/job-search` is anon-rate-limited
 * (12/hr), so it only fires once the fast search has settled on zero hits,
 * never on every keystroke.
 */
"use client"

import { useQuery } from "@tanstack/react-query"
import { publicCv } from "@/lib/api"
import { getTurnstileToken } from "@/lib/turnstile"

export function useJobGenFallback(query: string, opts: { enabled: boolean }) {
  const term = query.trim()
  const { data, isFetching } = useQuery({
    queryKey: ["jobGenFallback", term],
    queryFn: async () => {
      const token = await getTurnstileToken().catch(() => null)
      return publicCv.searchJobs({ query: term, turnstileToken: token })
    },
    enabled: opts.enabled && term.length >= 2,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  return {
    loading: opts.enabled && isFetching,
    cards: data?.cards ?? [],
    relaxed: data?.relaxed ?? [],
  }
}
