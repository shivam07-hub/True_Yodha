"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"

import { getAccessToken } from "@/lib/session"

/**
 * What the user actually waited for — the half no server metric can see.
 *
 * Railway measures edge time and `route.latency` measures server time. Neither
 * includes the render, and neither knows the connection the wait happened on.
 * About 10% of uploaders are on 3G or 2G, where a 300ms response is not a 300ms
 * wait, and the server reports that request as fine.
 *
 * This replaces `use-route-perf-marks`, which was dead three ways and is
 * deleted with it (ARCHITECTURE_READ_PATH §19.2):
 *
 *  1. nothing called it, so `route_perf_events` has never held a row;
 *  2. it sent with `navigator.sendBeacon`, which cannot carry an Authorization
 *     header, at an endpoint that requires one — every beacon would have 401'd.
 *     Its own comment said "endpoint must accept unauthenticated posts". Making
 *     the endpoint public was the wrong half to change: attribution is what
 *     lets a wait be tied to a user, a network and a cohort, and it is what the
 *     test-account exclusion needs to keep persona traffic out of the numbers;
 *  3. `ttfa_ms` was `performance.now()` — time since PAGE LOAD, not since the
 *     route change. Correct on the first page of a session and meaningless
 *     after it, which is most of an authed session.
 *
 * Measured here from the navigation, using the pathname change as the start.
 * Mounted once in the shell, so it survives the navigations it measures.
 */

const TELEMETRY_URL = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? ""}/v1/telemetry/route-perf`

/** The journey ARCHITECTURE_READ_PATH §16 ranks first by where users wait.
 *  Prefix match, so `/cv/anything` counts as `/cv`. */
const WATCHED = ["/onboarding", "/market", "/cv", "/home"] as const

const SAMPLE_RATE = process.env.NODE_ENV === "production" ? 0.1 : 1.0

function watched(path: string): string | null {
  return WATCHED.find((base) => path === base || path.startsWith(`${base}/`)) ?? null
}

function networkType(): string | null {
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string }
    mozConnection?: { effectiveType?: string }
    webkitConnection?: { effectiveType?: string }
  }
  return (
    nav.connection?.effectiveType ??
    nav.mozConnection?.effectiveType ??
    nav.webkitConnection?.effectiveType ??
    null
  )
}

export function RoutePerfProbe() {
  const pathname = usePathname()
  // When THIS navigation started. The first render of a session has no prior
  // navigation, so page load is the honest origin and `performance.now()` is
  // already measured from it.
  const startedAt = useRef<number | null>(null)
  const sent = useRef<string | null>(null)

  useEffect(() => {
    startedAt.current = performance.now()
    sent.current = null
  }, [pathname])

  useEffect(() => {
    const route = watched(pathname)
    if (!route || sent.current === pathname) return
    const started = startedAt.current
    if (started === null) return

    // Two frames: the first fires before the browser has painted this commit,
    // the second after it. Measuring on the first would report layout time and
    // call it a wait the user never had.
    let cancelled = false
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return
        sent.current = pathname
        if (Math.random() > SAMPLE_RATE) return
        const token = getAccessToken()
        // Unauthenticated page views are not dropped silently for lack of a
        // token — they are simply not this instrument's subject. The endpoint
        // attributes to a user, which is what the test-account exclusion needs.
        if (!token) return
        void fetch(TELEMETRY_URL, {
          method: "POST",
          keepalive: true,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            route,
            ttfa_ms: Math.round(performance.now() - started),
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            network_type: networkType(),
            session_id: sessionStorage.getItem("session_id") ?? undefined,
          }),
          // Telemetry must never be able to fail the journey it is watching.
        }).catch(() => {})
      })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [pathname])

  return null
}
