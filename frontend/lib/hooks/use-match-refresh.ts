"use client"

import { useRef, useState } from "react"
import { useMutation, type QueryClient } from "@tanstack/react-query"
import { jobs, type JobComputeStatusResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { clearLocalCache, userCacheKey } from "@/lib/local-cache"
import { useXPStore } from "@/store/xpStore"

export const REFRESH_XP_COST = 50

export function useMatchRefresh(token: string | null, queryClient: QueryClient) {
  const abortRef = useRef<AbortController | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [isExhausted, setIsExhausted] = useState(false)
  const { setBalance } = useXPStore()

  function stop() {
    abortRef.current?.abort()
    abortRef.current = null
  }

  function applyStatus(p: JobComputeStatusResponse & { exhausted?: boolean }) {
    if (p.status === "queued" || p.status === "running") {
      setIsRefreshing(true)
      setNotice(p.message || (p.status === "queued" ? "Refresh queued. We'll update this list shortly." : "Refreshing matches…"))
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
      if (p.exhausted) {
        setIsExhausted(true)
        setNotice("No new matches")
      } else if ((p.matches_written ?? 0) > 0) {
        setNotice(`+${p.matches_written ?? 0} new matches · −${REFRESH_XP_COST} XP`)
      } else if (p.needs_onboarding) {
        setNotice("Upload your CV first to generate role matches.")
      } else {
        setNotice("No new matches")
        setIsExhausted(true)
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
      if (payload.new_xp_balance != null) setBalance(payload.new_xp_balance)

      if (payload.status === "queued" || payload.status === "running" || payload.already_running) {
        setIsRefreshing(true)
        setNotice(payload.message || "Refreshing matches…")
        void stream()
        return
      }
      applyStatus({
        user_id: "current",
        batch_week: payload.batch_week,
        status: payload.status ?? "succeeded",
        job_id: payload.job_id ?? null,
        already_running: !!payload.already_running,
        matches_written: payload.matches_written,
        from_cache: payload.from_cache,
        exhausted: payload.exhausted,
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

  return { isRefreshing: isRefreshing || mutation.isPending, notice, isExhausted, refresh, cleanup }
}
