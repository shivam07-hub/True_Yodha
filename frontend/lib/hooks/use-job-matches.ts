import { useQuery } from "@tanstack/react-query"

import { jobs, type JobMatchesResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { JOB_MATCHES_CACHE_PARTS } from "@/lib/job-matches-cache"
import { userCacheKey, withLocalCache } from "@/lib/local-cache"

/** A week: matches are recomputed by a Match Run, not by the clock. */
export const MATCHES_TTL = 7 * 24 * 60 * 60 * 1000

/**
 * The ONE fetching read of the user's matches.
 *
 * The desktop hero, the refresh banner and the mobile profile all read
 * `dataKeys.jobs()`. The first two each carried their own copy of this query
 * and of MATCHES_TTL; the third read matches out of /home/bootstrap, which no
 * longer carries them — the bundle waited on them, its slowest section, for up
 * to 12.4s in prod. One definition, one key, so TanStack folds concurrent
 * callers into a single request and no caller can drift onto a different fetch.
 */
export function useJobMatches(token: string | null | undefined, enabled: boolean) {
  return useQuery<JobMatchesResponse>({
    queryKey: dataKeys.jobs(),
    queryFn: () =>
      withLocalCache(userCacheKey(token!, JOB_MATCHES_CACHE_PARTS), MATCHES_TTL, () => jobs.matches(token!)),
    enabled: !!token && enabled,
    staleTime: MATCHES_TTL,
  })
}
