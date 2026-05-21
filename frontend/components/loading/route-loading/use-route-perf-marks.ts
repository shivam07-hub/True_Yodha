"use client"

import { useEffect, useRef } from "react"
import { getAccessToken } from "@/lib/session"

const TELEMETRY_URL = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? ""}/v1/telemetry/route-perf`
const SAMPLE_RATE = process.env.NODE_ENV === "production" ? 0.1 : 1.0

interface PerfPayload {
  route: string
  ttfa_ms: number
  tti_cc_ms?: number
  viewport: string
  session_id?: string
}

export function useRoutePerfMarks(route: string): { markTtiCC: () => void } {
  const ttfaMs = useRef<number | null>(null)
  const ttiCCMs = useRef<number | null>(null)

  useEffect(() => {
    ttfaMs.current = Math.round(performance.now())
    performance.mark(`ttfa:${route}`)
  }, [route])

  useEffect(() => {
    return () => {
      if (Math.random() > SAMPLE_RATE) return
      if (ttfaMs.current === null) return

      const payload: PerfPayload = {
        route,
        ttfa_ms: ttfaMs.current,
        tti_cc_ms: ttiCCMs.current ?? undefined,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        session_id: sessionStorage.getItem("session_id") ?? undefined,
      }

      const body = JSON.stringify(payload)
      if (navigator.sendBeacon) {
        // Beacon doesn't support auth headers — endpoint must accept unauthenticated posts
        navigator.sendBeacon(TELEMETRY_URL, new Blob([body], { type: "application/json" }))
      } else {
        const token = getAccessToken()
        fetch(TELEMETRY_URL, {
          method: "POST",
          body,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          keepalive: true,
        }).catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route])

  return {
    markTtiCC: () => {
      if (ttiCCMs.current !== null) return
      ttiCCMs.current = Math.round(performance.now())
      performance.mark(`tti-cc:${route}`)
    },
  }
}
