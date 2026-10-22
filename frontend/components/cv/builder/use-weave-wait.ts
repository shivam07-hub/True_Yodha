"use client"

/**
 * Wait on a weave the POST stopped waiting for (`lib/cv/weave-wait.ts`).
 *
 * Each read is written into the overlay's own ["cv-weave", job] entry, so a
 * proposal that lands is seeded by the same path a reopened draft takes.
 */

import { useCallback, useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { cv as cvApi } from "@/lib/api"
import { WEAVE_POLL_MS, weaveWaitVerdict } from "@/lib/cv/weave-wait"

export function useWeaveWait({ token, jobId, onLanded, onFailed }: {
  token: string
  jobId: string
  onLanded: () => void
  onFailed: () => void
}): { waiting: boolean; start: () => void } {
  const client = useQueryClient()
  // Keyed by when the wait began: a new wait never reads an old wait's answer.
  const [since, setSince] = useState<number | null>(null)
  const poll = useQuery({
    queryKey: ["cv-weave-wait", jobId, since],
    queryFn: () => cvApi.weave.get(token, jobId),
    enabled: since !== null,
    refetchInterval: WEAVE_POLL_MS,
    retry: false,
    gcTime: 0,
  })

  useEffect(() => {
    if (since === null || !poll.data) return
    client.setQueryData(["cv-weave", jobId], poll.data)
    const verdict = weaveWaitVerdict(poll.data)
    if (verdict === "working") return
    setSince(null)
    if (verdict === "landed") onLanded()
    else onFailed()
  }, [since, poll.data, client, jobId, onLanded, onFailed])

  const start = useCallback(() => setSince(Date.now()), [])
  return { waiting: since !== null, start }
}
