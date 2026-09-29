"use client"

import { useEffect, useRef } from "react"
import { emitLoopStep, type CoreLoopStep } from "@/lib/api"

/**
 * Record a core-loop step when a surface opens for a job — once per job while
 * it stays mounted. An effect keyed on the token re-runs when the session
 * refreshes, and dev StrictMode runs every effect twice; neither is a second
 * visit, and the funnel counts visits (2026-09-30: every editor open wrote two
 * rows).
 */
export function useLoopStepOnce(
  token: string | null | undefined,
  step: CoreLoopStep,
  jobId: string,
  surface: string,
): void {
  const sentFor = useRef<string | null>(null)
  useEffect(() => {
    if (!token || !jobId || sentFor.current === jobId) return
    sentFor.current = jobId
    emitLoopStep(token, step, jobId, surface)
  }, [token, step, jobId, surface])
}
