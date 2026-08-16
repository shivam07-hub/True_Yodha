"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { jobs, type MatchBrainResult } from "@/lib/api"

const POLL_MS = 2500
const POLL_CAP = 24 // ~1 min, then stop. Stored overlap stays on the card.

/**
 * The on-open Matching-Brain eval for ONE job (Consolidation D / Backlog #36
 * Slice 3: brain-everywhere). Opening a job ANYWHERE — desktop drawer (MyroTake)
 * or the mobile detail sheet — reads the Durable Answer and enqueues the named
 * write if it is missing. First paint is stored overlap; MyroTake mounts when
 * a scored eval exists. Pass a null `jobId` (sheet closed) to skip the fetch.
 */
export function useMatchBrain(
  token: string | null | undefined,
  jobId: string | null | undefined,
): { result: MatchBrainResult | null } {
  const polls = React.useRef(0)
  React.useEffect(() => {
    polls.current = 0
  }, [jobId])

  const query = useQuery({
    queryKey: ["match-brain", jobId],
    queryFn: () => jobs.ensureBrain(token!, jobId!),
    enabled: !!token && !!jobId,
    refetchInterval: (q) => {
      const data = q.state.data
      if (data?.available && data.overall_score != null) return false
      polls.current += 1
      return polls.current <= POLL_CAP ? POLL_MS : false
    },
  })

  const data = query.data
  if (!data?.available || data.overall_score == null) return { result: null }
  return { result: data }
}
