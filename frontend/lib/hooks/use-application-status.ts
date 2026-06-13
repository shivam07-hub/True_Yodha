"use client"

import { useCallback, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { jobs } from "@/lib/api"
import type { ApplicationResponse, ApplicationStatus, JobMatchesResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"

/** Minimal job facts needed to synthesise an application row on first save —
 *  when no record exists yet (e.g. ♥ Like on a Myro match). Optional: the hook
 *  falls back to the jobs cache, then to empty strings. */
export interface OptimisticJobMeta {
  title?: string | null
  company?: string | null
  jobDescription?: string | null
}

export interface UseApplicationStatus {
  /** Set (or create) the application stage for a job — OPTIMISTIC + instant. */
  setStatus: (jobId: string, status: ApplicationStatus, meta?: OptimisticJobMeta) => void
  /** True while a job's status write is in flight (per-job). */
  isPending: (jobId: string) => boolean
  /** Last failed write, for inline surfacing. */
  error: { jobId: string; message: string } | null
  clearError: () => void
}

/**
 * useApplicationStatus — the one deep module for "change a job's application
 * stage" (saved / applied / screening / … / offer).
 *
 * Owns the whole optimistic contract so no caller can get it half-right —
 * exactly like {@link useFollowCompany} does for the follow act:
 *   tap → optimistic applications-cache write (instant; the ♥ fills, the chip
 *   flips, the column moves on the SAME frame) → reconcile on success →
 *   rollback + error on failure.
 *
 * Before this hook, the optimistic `updateApplication` write was re-implemented
 * at every status tap surface (dashboard feed, pursuit-stage picker, tracker
 * board) — and most of them skipped it, so the tap waited on the round-trip
 * (the latency the design law forbids: the UI state IS the feedback). One
 * module, one test surface, every surface instant.
 *
 * The applications query is the canonical `ApplicationResponse[]` at
 * `dataKeys.applications()`; on first save we synthesise a row from `meta` (or
 * the jobs cache) so derived views (buildFeed liked-set, tracker columns) flip
 * immediately.
 */
export function useApplicationStatus(token: string | null): UseApplicationStatus {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [error, setError] = useState<{ jobId: string; message: string } | null>(null)

  const appsKey = dataKeys.applications()

  const markPending = useCallback((jobId: string, on: boolean) => {
    setPending((prev) => {
      const next = new Set(prev)
      if (on) next.add(jobId)
      else next.delete(jobId)
      return next
    })
  }, [])

  const mutation = useMutation({
    mutationFn: ({ jobId, status }: { jobId: string; status: ApplicationStatus; meta?: OptimisticJobMeta }) =>
      jobs.updateApplication(token!, jobId, { status }),
    onMutate: async ({ jobId, status, meta }) => {
      markPending(jobId, true)
      setError(null)
      await queryClient.cancelQueries({ queryKey: appsKey })
      const prevApps = queryClient.getQueryData<ApplicationResponse[]>(appsKey)
      queryClient.setQueryData<ApplicationResponse[] | undefined>(appsKey, (old) => {
        const list = old ?? []
        if (list.some((a) => a.job_id === jobId)) {
          return list.map((a) => (a.job_id === jobId ? { ...a, status } : a))
        }
        const jm = queryClient
          .getQueryData<JobMatchesResponse>(dataKeys.jobs())
          ?.jobs.find((j) => j.job_id === jobId)
        const optimistic: ApplicationResponse = {
          id: -Date.now(),
          job_id: jobId,
          title: meta?.title ?? jm?.title ?? "",
          company: meta?.company ?? jm?.company ?? null,
          job_description: meta?.jobDescription ?? jm?.job_description ?? null,
          status,
          source: "myro_match",
          applied_at: null,
          response_at: null,
          checkin_sent_at: null,
          notes: null,
          created_at: new Date().toISOString(),
        }
        return [...list, optimistic]
      })
      return { prevApps }
    },
    onError: (err, vars, ctx) => {
      if (ctx?.prevApps) queryClient.setQueryData(appsKey, ctx.prevApps)
      setError({ jobId: vars.jobId, message: err instanceof Error ? err.message : "Couldn't update." })
    },
    onSettled: (_d, _e, vars) => {
      markPending(vars.jobId, false)
      queryClient.invalidateQueries({ queryKey: appsKey })
      queryClient.invalidateQueries({ queryKey: dataKeys.staleApplications() })
    },
  })

  const setStatus = useCallback(
    (jobId: string, status: ApplicationStatus, meta?: OptimisticJobMeta) => {
      if (!token) return
      mutation.mutate({ jobId, status, meta })
    },
    [token, mutation],
  )

  const isPending = useCallback((jobId: string) => pending.has(jobId), [pending])
  const clearError = useCallback(() => setError(null), [])

  return { setStatus, isPending, error, clearError }
}
