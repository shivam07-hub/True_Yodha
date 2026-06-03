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

  useEffect(() => {
    reconcile()
    const sync = () => reconcile()
    window.addEventListener("focus", sync)
    window.addEventListener("pageshow", sync)
    document.addEventListener("visibilitychange", sync)
    return () => {
      window.removeEventListener("focus", sync)
      window.removeEventListener("pageshow", sync)
      document.removeEventListener("visibilitychange", sync)
    }
  }, [reconcile])

  useEffect(() => {
    if (!running) return
    tick()
    const id = window.setInterval(() => tick(), 1000)
    return () => window.clearInterval(id)
  }, [running, tick])

  return null
}
