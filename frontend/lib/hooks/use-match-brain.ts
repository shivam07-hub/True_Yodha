"use client"

import * as React from "react"
import { jobs, type MatchBrainResult } from "@/lib/api"

/**
 * The on-open Matching-Brain eval for ONE job (Consolidation D / Backlog #36
 * Slice 3: brain-everywhere). Opening a job ANYWHERE — desktop drawer (MyroTake)
 * or the mobile detail sheet — fetches this; the backend computes it once and
 * caches it forever (`on_demand.ensure_job_eval`), so opening a card is what
 * warms its verdict. ONE hook, every consumer, so no surface can open a job
 * without warming it. Pass a null `jobId` (sheet closed) to skip the fetch.
 */
export function useMatchBrain(
  token: string | null | undefined,
  jobId: string | null | undefined,
): { loading: boolean; result: MatchBrainResult | null } {
  const [loading, setLoading] = React.useState(false)
  const [result, setResult] = React.useState<MatchBrainResult | null>(null)

  React.useEffect(() => {
    if (!token || !jobId) {
      setResult(null)
      setLoading(false)
      return
    }
    let live = true
    setLoading(true)
    setResult(null)
    jobs
      .ensureBrain(token, jobId)
      .then((r) => live && setResult(r))
      .catch(() => live && setResult(null))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [token, jobId])

  return { loading, result }
}
