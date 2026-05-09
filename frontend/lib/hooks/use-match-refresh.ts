"use client"

import { useRef, useState } from "react"
import { useMutation, type QueryClient } from "@tanstack/react-query"
import { jobs, type JobComputeStatusResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { clearLocalCache, userCacheKey } from "@/lib/local-cache"

export function useMatchRefresh(token: string | null, queryClient: QueryClient) {
  const abortRef = useRef<AbortController | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  function stop() {
    abortRef.current?.abort()
    abortRef.current = null
  }

  function applyStatus(p: JobComputeStatusResponse) {
    if (p.status === "queued" || p.status === "running") {
      setIsRefreshing(true)
      setNotice(p.message || (p.status === "queued" ? "Refresh queued. We'll update this list shortly." : "Refreshing matches in the background…"))
      return
    }
    if (p.status === "failed") {
      setIsRefreshing(false)
      setNotice(p.error || "Refresh failed. Please try again.")
      stop()
      return
    }
    if (p.status === "succeeded") {
      setIsRefreshing(false)
      if (p.from_cache) {
        setNotice("Using this week's cached matches.")
      } else if ((p.matches_written ?? 0) > 0) {
        setNotice(`Updated ${p.matches_written ?? 0} matched roles.`)
      } else if (p.needs_onboarding) {
        setNotice("Upload your CV first to generate role matches.")
      } else {
        const d = p.debug as { user_skills_count?: number | null; candidate_jobs_count?: number | null; top_jobs_count?: number | null } | null
        setNotice(d
          ? `No matches generated (skills=${d.user_skills_count ?? 0}, candidates=${d.candidate_jobs_count ?? 0}, ranked=${d.top_jobs_count ?? 0}). Try updating target roles in Intel, then refresh.`
          : "No match set generated. Try updating target roles in Intel, then refresh.")
      }
      if (token) clearLocalCache(userCacheKey(token, ["matches"]))
      queryClient.invalidateQueries({ queryKey: dataKeys.jobs() })
      stop()
      return
    }
    if (p.status === "idle") {
      setIsRefreshing(false)
      stop()
    }
  }

  async function stream() {
    if (!token) return
    stop()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await jobs.computeStatusStream(token, applyStatus, controller.signal)
    } catch (error) {
      if (controller.signal.aborted) return
      setIsRefreshing(false)
      setNotice((error as Error).message || "Could not receive refresh progress updates.")
      stop()
    }
  }

  const mutation = useMutation({
    mutationFn: () => jobs.compute(token!),
    onSuccess: (payload) => {
      if (payload.status === "queued" || payload.status === "running" || payload.already_running) {
        setIsRefreshing(true)
        setNotice(payload.message || "Refreshing matches in the background…")
        void stream()
        return
      }
      applyStatus({
        user_id: "current",
        batch_week: payload.batch_week,
        status: "succeeded",
        job_id: payload.job_id ?? null,
        already_running: !!payload.already_running,
        matches_written: payload.matches_written,
        from_cache: payload.from_cache,
        needs_onboarding: payload.needs_onboarding ?? false,
        debug: payload.debug ?? null,
        message: payload.message ?? null,
        error: null,
        enqueued_at: null,
        started_at: null,
        finished_at: null,
      })
    },
    onError: () => {
      setIsRefreshing(false)
      setNotice("Refresh failed. Please try again.")
    },
  })

  function refresh() {
    setNotice(null)
    mutation.mutate()
  }

  function cleanup() {
    stop()
  }

  return { isRefreshing: isRefreshing || mutation.isPending, notice, refresh, cleanup }
}
