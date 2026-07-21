"use client"

import { useQuery } from "@tanstack/react-query"
import { getAccessToken } from "@/lib/session"
import { jobs, type JobLiveness } from "@/lib/api"

/**
 * Is the open listing still live? Fires when a job detail opens — the moment
 * before a user spends effort on it, which is where a ghost actually costs
 * them. The backend verifies on demand and caches ~6h, so this is one cheap
 * read per opened job, not a corpus sweep.
 *
 * Fail-soft by construction: any error resolves to no notice at all. A failed
 * liveness check must never block or scare a user off a real job.
 */
export function useJobLiveness(jobId: string | null | undefined) {
  const query = useQuery<JobLiveness | null>({
    queryKey: ["jobLiveness", jobId],
    queryFn: async () => {
      const token = getAccessToken()
      if (!token || !jobId) return null
      try {
        return await jobs.liveness(token, jobId)
      } catch {
        return null
      }
    },
    enabled: !!jobId,
    // Matches the server-side verdict cache — re-opening the same card in a
    // session costs nothing.
    staleTime: 6 * 60 * 60 * 1000,
    retry: false,
  })

  return { liveness: query.data ?? null, loading: query.isLoading }
}
