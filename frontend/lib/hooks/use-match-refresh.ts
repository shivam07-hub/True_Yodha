"use client"

import { useRef, useState } from "react"
import { useMutation, type QueryClient } from "@tanstack/react-query"
import { jobs, type JobComputeStatusResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { clearLocalCache, userCacheKey } from "@/lib/local-cache"
import { useXPStore } from "@/store/xpStore"

export const REFRESH_XP_COST = 100

export function useMatchRefresh(token: string | null, queryClient: QueryClient) {
  const abortRef = useRef<AbortController | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const { setBalance } = useXPStore()

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
        setNotice(`Updated ${p.matches_written ?? 0} matched roles · −${REFRESH_XP_COST} XP`)
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
      await jobs.refreshStatusStream(token, applyStatus, controller.signal)
    } catch (error) {
      if (controller.signal.aborted) return
      setIsRefreshing(false)
      setNotice((error as Error).message || "Could not receive refresh progress updates.")
      stop()
    }
  }

  const mutation = useMutation({
    mutationFn: () => jobs.refresh(token!),
    onSuccess: (payload) => {
      // Sync XP balance when deducted (non-cached refresh)
      if (payload.new_xp_balance != null) setBalance(payload.new_xp_balance)

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
    onError: (error: Error) => {
      setIsRefreshing(false)
      const msg = error.message || ""
      if (msg.includes("Insufficient XP")) {
        setNotice(`Not enough XP — refresh costs ${REFRESH_XP_COST} XP. Complete a Forge session to earn more.`)
      } else {
        setNotice("Refresh failed. Please try again.")
      }
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
