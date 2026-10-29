"use client"

/**
 * Wait on a paid run the POST stopped waiting for (`lib/run-wait.ts`).
 *
 * Each read is written into the surface's own [entry, job] query entry, so an
 * artifact that lands is seeded by the same path a reopened one takes. The GET
 * carries no balance, so a landed run reads it — the charge happened on the
 * server while nobody was listening.
 */

import { useCallback, useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { xp as xpApi } from "@/lib/api"
import { RUN_POLL_MS, type RunWaitVerdict } from "@/lib/run-wait"
import { useXPStore } from "@/store/xpStore"

export function useRunWait<T>({ token, jobId, entry, action, read, verdict, onFailed }: {
  token: string
  jobId: string
  /** The surface's own query entry, keyed [entry, jobId]. */
  entry: string
  /** The coin action the run charges under. */
  action: string
  read: () => Promise<T>
  verdict: (get: T) => RunWaitVerdict
  onFailed: () => void
}): { waiting: boolean; start: () => void } {
  const client = useQueryClient()
  const applyXpChange = useXPStore((s) => s.applyXpChange)
  // Keyed by when the wait began: a new wait never reads an old wait's answer.
  const [since, setSince] = useState<number | null>(null)
  const poll = useQuery({
    queryKey: ["run-wait", entry, jobId, since],
    queryFn: read,
    enabled: since !== null,
    refetchInterval: RUN_POLL_MS,
    retry: false,
    gcTime: 0,
  })

  useEffect(() => {
    if (since === null || !poll.data) return
    client.setQueryData([entry, jobId], poll.data)
    const outcome = verdict(poll.data)
    if (outcome === "working") return
    setSince(null)
    if (outcome === "failed") {
      onFailed()
      return
    }
    xpApi.balance(token)
      .then((r) => applyXpChange({ newBalance: r.balance, action }))
      .catch(() => {})
  }, [since, poll.data, client, entry, jobId, verdict, onFailed, token, action, applyXpChange])

  const start = useCallback(() => setSince(Date.now()), [])
  return { waiting: since !== null, start }
}
