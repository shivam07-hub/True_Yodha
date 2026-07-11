"use client"

import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { jobs } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { takePendingJobSave } from "@/lib/anon-job-stash"

/**
 * Replays a job the user tried to save while logged out (Exception 2).
 * `postAuthDestination` lands anon job-savers on Collections; this hook, mounted
 * there, consumes the stashed job_id once, saves it against the real API, and
 * refreshes the applications list so the saved row appears immediately.
 *
 * Fires exactly once per mount (takePendingJobSave clears the stash, plus a ref
 * guard against a token flip re-running the effect). The save is best-effort:
 * a duplicate/transient failure never disturbs the surface — the user is already
 * where they expect to be.
 */
export function usePendingJobSaveClaim(token: string | null): void {
  const queryClient = useQueryClient()
  const claimed = useRef(false)

  useEffect(() => {
    if (!token || claimed.current) return
    const jobId = takePendingJobSave()
    if (!jobId) return
    claimed.current = true
    jobs
      .saveJob(token, jobId)
      .catch(() => {
        // already saved / transient — the user still lands on Collections.
      })
      .finally(() => {
        queryClient.invalidateQueries({ queryKey: dataKeys.applications() })
      })
  }, [token, queryClient])
}
