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

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => tick(), 1000)
    return () => window.clearInterval(id)
  }, [running, tick])

  return null
}
