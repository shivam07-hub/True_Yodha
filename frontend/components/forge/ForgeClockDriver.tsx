"use client"

import { useEffect } from "react"
import { useForgeTimerStore } from "@/store/forgeTimerStore"

/**
 * Singleton heartbeat for the Forge Session.
 *
 * Mount exactly ONCE at the root of the authed app (see AppShell). Every other
 * Forge surface (ForgeXpPill, SidebarForgeTimer, the /forge dial) reads store
 * state via useForgeSession() — none of them owns a setInterval. This removes
 * an entire bug class: two renderers both calling tick() per second.
 *
 * Renders nothing.
 */
export function ForgeClockDriver() {
  const running = useForgeTimerStore((s) => s.running)
  const tick = useForgeTimerStore((s) => s.tick)
  const reconcile = useForgeTimerStore((s) => s.reconcile)
  const setRunning = useForgeTimerStore((s) => s.setRunning)

  useEffect(() => {
    reconcile()
    const sync = () => reconcile()
    // Locked decision (CONTEXT.md → Forge Session): the timer is never
    // always-running. When the tab is backgrounded we freeze the session — the
    // user resumes deliberately. setRunning(false) settles the clock up to the
    // moment of hiding; reconcile() on return recomputes without the idle gap.
    const onVisibility = () => {
      if (document.hidden) setRunning(false)
      else reconcile()
    }
    window.addEventListener("focus", sync)
    window.addEventListener("pageshow", sync)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener("focus", sync)
      window.removeEventListener("pageshow", sync)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [reconcile, setRunning])

  useEffect(() => {
    if (!running) return
    tick()
    const id = window.setInterval(() => tick(), 1000)
    return () => window.clearInterval(id)
  }, [running, tick])

  return null
}
