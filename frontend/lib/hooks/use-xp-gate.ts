"use client"

import { useXPStore } from "@/store/xpStore"
import { useXPGateStore } from "@/store/xpGateStore"
import { trackEvent } from "@/lib/analytics"

interface UseXPGateParams {
  /** Cost in XP for the gated action. */
  cost: number
  /** Stable string identifying the action (e.g. "follow_company", "polish_skill"). Used for telemetry. */
  action: string
  /** Optional XP floor — balance after spend must stay >= floor. Default 0. */
  floor?: number
}

interface XPGateResult {
  /** True if `balance - cost >= floor`. */
  canAfford: boolean
  /** Route any spend through here. Fires telemetry, opens the gate modal on insufficient funds. */
  attempt: (callback: () => void | Promise<void>) => void
}

/**
 * Single source of truth for XP cost policy at every call site.
 *
 * Decision context: Ousterhout audit 2026-05-23 flagged XPStore as a
 * shallow module — interface is a number, policy lives in every caller.
 * Five sites (follow company, polish skill, CV upload, job analysis,
 * match refresh) each re-implemented "do I have enough?", insufficient-
 * funds copy, and disabled state.
 *
 * This hook is the deep-module read API; the heavy lifting (modal,
 * telemetry, future earn-path routing) lives behind it. Callers do:
 *
 *     const gate = useCoinsGate({ cost: 10, action: "follow_company" })
 *     <button disabled={!gate.canAfford} onClick={() => gate.attempt(() => follow())}>
 */
export function useCoinsGate({ cost, action, floor = 0 }: UseXPGateParams): XPGateResult {
  const balance = useXPStore((s) => s.balance)
  const openGate = useXPGateStore((s) => s.openGate)

  const canAfford = balance - cost >= floor

  function attempt(callback: () => void | Promise<void>): void {
    if (canAfford) {
      trackEvent("xp_gate_passed", { action, cost, balance })
      void callback()
      return
    }
    trackEvent("xp_gate_blocked", { action, cost, balance })
    openGate({ cost, action })
  }

  return { canAfford, attempt }
}
