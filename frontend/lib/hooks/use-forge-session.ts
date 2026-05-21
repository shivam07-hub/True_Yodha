"use client"

import { useCallback } from "react"
import { useMutation } from "@tanstack/react-query"

import { xp } from "@/lib/api"
import { getAccessToken } from "@/lib/session"
import {
  FORGE_AMBIENT_DURATION,
  pendingXpFromMinutes,
  useForgeTimerStore,
} from "@/store/forgeTimerStore"
import { useXPStore } from "@/store/xpStore"
import type { CartSkill, ForgeSessionResult } from "@/types/xp"

export type ForgeSessionTimerState = "idle" | "running" | "paused" | "complete"

export interface UseForgeSessionResult {
  state: ForgeSessionTimerState
  skillName: string | null
  skillId: string | null
  remaining: number
  mm: number
  ss: number
  ringPct: number
  pendingMinutes: number
  pendingXp: number
  canClaim: boolean
  claiming: boolean
  claimError: string | null

  startSession: (skill: CartSkill | { skill_name: string; skill_id?: string | null }) => void
  startLastForged: () => Promise<void>
  pause: () => void
  resume: () => void
  dismiss: () => void
  restartSession: () => void
  claim: (opts?: { onClaimed?: (result: ForgeSessionResult) => void }) => Promise<void>
}

/**
 * View-model for any Forge UI surface — see CONTEXT.md → "Forge Session".
 *
 * The 1-second heartbeat is NOT owned here. Mount <ForgeClockDriver /> once
 * at the root of the app (AppShell does this). Every consumer of this hook
 * is read-only on the clock — multiple renderers cannot accidentally double-tick.
 */
export function useForgeSession(): UseForgeSessionResult {
  const {
    skillName,
    skillId,
    sessionActive,
    running,
    remaining,
    pendingMinutes,
    startSession: storeStart,
    setRunning,
    restartSession,
    dismiss,
    markClaimed,
  } = useForgeTimerStore()

  const setXPBalance = useXPStore((s) => s.setBalance)

  const claimMutation = useMutation({
    mutationFn: async (minutes: number) => {
      const token = getAccessToken()
      if (!token) throw new Error("Sign in first.")
      if (!skillName) throw new Error("No active skill.")
      return xp.completeForge(token, {
        skill_name: skillName,
        skill_id: skillId ?? undefined,
        duration_minutes: minutes,
        session_type: "ambient",
      })
    },
  })

  const claim = useCallback(
    async (opts?: { onClaimed?: (result: ForgeSessionResult) => void }) => {
      const minutes = pendingMinutes
      if (minutes <= 0 || claimMutation.isPending) return
      const result = await claimMutation.mutateAsync(minutes)
      markClaimed(minutes)
      setXPBalance(result.new_xp_balance)
      opts?.onClaimed?.(result)
    },
    [pendingMinutes, claimMutation, markClaimed, setXPBalance],
  )

  const startLastForged = useCallback(async () => {
    const token = getAccessToken()
    if (!token) return
    try {
      const res = await xp.lastForgedSkill(token)
      if (!res?.skill_name) return
      storeStart({ skill_name: res.skill_name, skill_id: res.skill_id })
    } catch {
      // First-time users have no last skill — silent no-op.
    }
  }, [storeStart])

  // Derive state on each render. Cheap; depends only on store fields.
  let state: ForgeSessionTimerState
  if (!sessionActive) state = "idle"
  else if (remaining === 0 && !running) state = "complete"
  else if (running) state = "running"
  else state = "paused"

  const mm = Math.floor(remaining / 60)
  const ss = remaining % 60
  const elapsed = FORGE_AMBIENT_DURATION - remaining
  const ringPct = sessionActive ? Math.min(100, (elapsed / FORGE_AMBIENT_DURATION) * 100) : 0

  return {
    state,
    skillName,
    skillId,
    remaining,
    mm,
    ss,
    ringPct,
    pendingMinutes,
    pendingXp: pendingXpFromMinutes(pendingMinutes),
    canClaim: pendingMinutes > 0 && !claimMutation.isPending,
    claiming: claimMutation.isPending,
    claimError: claimMutation.error instanceof Error ? claimMutation.error.message : null,

    startSession: storeStart,
    startLastForged,
    pause: () => setRunning(false),
    resume: () => setRunning(true),
    dismiss,
    restartSession,
    claim,
  }
}
