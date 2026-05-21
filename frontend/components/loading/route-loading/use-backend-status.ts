"use client"

import { useEffect, useState } from "react"
import { queryClient } from "@/lib/query-client"

const STATUS_URL = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? ""}/v1/status`

export type BackendStatus = { status: "ready" | "degraded" | "unknown"; version?: string }

export function useBackendStatus(): BackendStatus {
  const [result, setResult] = useState<BackendStatus>({ status: "unknown" })
  const [shouldPoll, setShouldPoll] = useState(false)

  // Activate on any 5xx query error
  useEffect(() => {
    const cache = queryClient.getQueryCache()
    return cache.subscribe((event) => {
      if (event.type !== "updated") return
      const err = event.query.state.error
      if (err instanceof Error && /HTTP 5\d{2}/.test(err.message)) {
        setShouldPoll(true)
      }
    })
  }, [])

  // Activate on visibilitychange after >5 min hidden
  useEffect(() => {
    let hiddenAt: number | null = null
    const FIVE_MIN = 5 * 60 * 1000

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now()
      } else if (hiddenAt !== null && Date.now() - hiddenAt > FIVE_MIN) {
        setShouldPoll(true)
        hiddenAt = null
      }
    }

    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [])

  // Poll with jittered backoff; sleep on recovery
  useEffect(() => {
    if (!shouldPoll) return

    let cancelled = false
    let delay = 10_000
    let timeoutId: ReturnType<typeof setTimeout>

    async function poll() {
      if (cancelled) return
      try {
        const res = await fetch(STATUS_URL)
        if (res.ok) {
          const data = await res.json().catch(() => null)
          setResult({ status: "ready", version: data?.version })
          setShouldPoll(false)
          return
        }
        // 404 = endpoint not yet deployed, treat as unknown not degraded
        if (res.status === 404) { setShouldPoll(false); return }
        setResult({ status: "degraded" })
      } catch {
        setResult({ status: "degraded" })
      }
      // Jittered backoff: 10s → 20s → 40s, cap 60s
      delay = Math.min(delay * 2, 60_000)
      if (!cancelled) {
        timeoutId = setTimeout(poll, delay + Math.random() * 2_000)
      }
    }

    poll()
    return () => { cancelled = true; clearTimeout(timeoutId) }
  }, [shouldPoll])

  return result
}
