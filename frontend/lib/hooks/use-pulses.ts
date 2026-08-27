"use client"

import { useMemo } from "react"
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { jobs, type JobPulse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useLaneYields } from "@/store/matchRunStore"

/**
 * Batched Job Pulse hydration for a visible card set.
 *
 * ONE request per visible batch (never one-per-card): the IDs are deduped,
 * trimmed to the backend's 100 cap, and sorted into a deterministic query key
 * so identical visible sets (e.g. the desktop + mobile grids on one page) share
 * a single cache entry. `keepPreviousData` holds the prior pulses during a
 * refetch so cards never flash empty while the batch reloads.
 */
export function usePulses(token: string | null, jobIds: string[]): Map<string, JobPulse> {
  const yieldLane = useLaneYields()
  const stableIds = useMemo(() => {
    const unique = Array.from(new Set(jobIds.filter((id) => id && id.trim())))
    return unique.slice(0, 100).sort()
  }, [jobIds])

  const query = useQuery({
    queryKey: dataKeys.jobPulses(stableIds),
    enabled: !!token && stableIds.length > 0 && !yieldLane,
    queryFn: () => jobs.pulses(token!, stableIds),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  })

  return useMemo(() => {
    const byId = new Map<string, JobPulse>()
    for (const pulse of query.data?.pulses ?? []) byId.set(pulse.job_id, pulse)
    return byId
  }, [query.data])
}
