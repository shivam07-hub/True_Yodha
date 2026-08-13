"use client"

// Three-wave login loading (backlog #41 L3).
//
// WAVE 1 fires immediately: identity + score + feed + Agent Picks. Those queries
// stay ungated — they are why the user logged in and must paint first.
//
// WAVE 2 is the idle auto-cascade: cheap + likely-used reads (scores/map,
// following, my-skills/demand) that should be warm before the user scrolls, but
// must NOT compete with wave 1 for the connection pool during the synchronized
// login instant. `useIdleWave` flips true only after wave 1 has settled AND the
// browser reports idle (requestIdleCallback), and cancels on unmount so a fast
// navigate never leaves a stray fetch scheduled.
//
// WAVE 3 is on-intent ONLY: expensive or rarely-used aggregations — chiefly the
// 22–25s `/jobs/analytics` — that must never fire on login. `useIntentWave`
// stays false until the user's first genuine interaction with the surface
// (scroll / pointer / key). A login with no interaction pays nothing, and
// because different users interact at different moments the load never
// re-synchronizes into a thundering herd the way an idle cascade would.

import { useEffect, useState } from "react"

/**
 * Wave 2 gate. Returns false until `ready` is true and the browser is idle,
 * then latches true for the life of the mount. Cancels the scheduled callback
 * if the component unmounts first (navigate away mid-idle).
 */
export function useIdleWave(ready: boolean): boolean {
  const [fired, setFired] = useState(false)

  useEffect(() => {
    if (!ready || fired) return
    let cancelled = false
    const run = () => {
      if (!cancelled) setFired(true)
    }

    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    const useRic = typeof w.requestIdleCallback === "function"
    // A 200ms fallback re-synchronised secondary reads while J0 was still in
    // flight on browsers without requestIdleCallback (Safari/WebViews).
    const id = useRic ? w.requestIdleCallback!(run, { timeout: 3000 }) : window.setTimeout(run, 1500)

    return () => {
      cancelled = true
      if (useRic && typeof w.cancelIdleCallback === "function") w.cancelIdleCallback(id)
      else window.clearTimeout(id)
    }
  }, [ready, fired])

  return fired
}

/**
 * Wave 3 gate. Returns false until the first genuine user interaction with the
 * page (scroll, pointerdown, or keydown), then latches true. A bare login that
 * never interacts leaves this false forever, so `/jobs/analytics` fires ZERO
 * times on login (the #41 success test). Listeners are `once` + passive and
 * self-remove on the first fire or on unmount.
 */
export function useIntentWave(): boolean {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (armed) return
    const arm = () => setArmed(true)
    const opts: AddEventListenerOptions = { once: true, passive: true }
    window.addEventListener("scroll", arm, opts)
    window.addEventListener("pointerdown", arm, opts)
    window.addEventListener("keydown", arm, opts)
    return () => {
      window.removeEventListener("scroll", arm)
      window.removeEventListener("pointerdown", arm)
      window.removeEventListener("keydown", arm)
    }
  }, [armed])

  return armed
}
