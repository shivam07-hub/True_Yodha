import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { reconcileForgeClock } from "@/lib/forge-clock"
import type { CartSkill } from "@/types/xp"

export const FORGE_AMBIENT_DURATION = 25 * 60  // seconds in one "session" unit
export const FORGE_AMBIENT_RATE = 2             // XP per minute (ambient)
export const FORGE_FOCUSED_RATE = 3             // XP per minute (focused / immersive)

export type ForgeSessionType = "ambient" | "focused"

export function forgeRateFor(sessionType: ForgeSessionType): number {
  return sessionType === "focused" ? FORGE_FOCUSED_RATE : FORGE_AMBIENT_RATE
}

interface ForgeTimerStore {
  // Active session metadata (the skill being forged right now).
  skillName: string | null
  skillId: string | null
  sessionActive: boolean
  running: boolean
  minimized: boolean
  dismissed: boolean

  // Continuation model — these accumulate across the day, survive reloads.
  // remaining counts down inside the current 25-min unit only.
  remaining: number          // seconds left in the current 25-min unit
  pendingMinutes: number     // minutes earned but not yet claimed to backend
  startedAt: number | null   // ms epoch — active session wall-clock anchor
  pausedAt: number | null    // ms epoch — current pause anchor
  pausedMs: number           // accumulated paused wall-clock time
  claimedMinutes: number     // minutes already sent to backend for this run
  carriedMinutes: number     // unclaimed minutes preserved across restarts
  lastTickAt: number | null  // ms epoch — last reconciliation checkpoint

  // Actions
  startSession: (skill: CartSkill | { skill_name: string; skill_id?: string | null }) => void
  setRunning: (r: boolean) => void
  setMinimized: (m: boolean) => void
  reconcile: (now?: number) => void
  tick: () => void
  restartSession: () => void
  resetSession: () => void
  dismiss: () => void
  markClaimed: (minutes: number) => void
}

interface ForgeTimerPersistedFields {
  skillName?: string | null
  skillId?: string | null
  sessionActive?: boolean
  running?: boolean
  remaining?: number
  pendingMinutes?: number
  startedAt?: number | null
  pausedAt?: number | null
  pausedMs?: number
  claimedMinutes?: number
  carriedMinutes?: number
  lastTickAt?: number | null
}

function clockPatch(state: ForgeTimerStore, now: number) {
  return reconcileForgeClock({
    durationSeconds: FORGE_AMBIENT_DURATION,
    sessionActive: state.sessionActive,
    running: state.running,
    startedAt: state.startedAt,
    pausedAt: state.pausedAt,
    pausedMs: state.pausedMs,
    claimedMinutes: state.claimedMinutes,
    carriedMinutes: state.carriedMinutes,
    lastTickAt: state.lastTickAt,
  }, now)
}

export const useForgeTimerStore = create<ForgeTimerStore>()(
  persist(
    (set, get) => ({
      skillName: null,
      skillId: null,
      sessionActive: false,
      running: false,
      minimized: false,
      dismissed: false,
      remaining: FORGE_AMBIENT_DURATION,
      pendingMinutes: 0,
      startedAt: null,
      pausedAt: null,
      pausedMs: 0,
      claimedMinutes: 0,
      carriedMinutes: 0,
      lastTickAt: null,

      startSession: (skill) => {
        const skill_id = "skill_id" in skill ? skill.skill_id ?? null : null
        const now = Date.now()
        const carriedMinutes = get().skillName === skill.skill_name ? get().pendingMinutes : 0
        set({
          skillName: skill.skill_name,
          skillId: skill_id,
          sessionActive: true,
          running: true,
          minimized: false,
          dismissed: false,
          remaining: FORGE_AMBIENT_DURATION,
          // Preserve any unclaimed minutes from a prior burst on the same skill.
          // Different-skill switches reset pending — backend credits before switching.
          pendingMinutes: carriedMinutes,
          startedAt: now,
          pausedAt: null,
          pausedMs: 0,
          claimedMinutes: 0,
          carriedMinutes,
          lastTickAt: now,
        })
      },

      setRunning: (r) => set((state) => {
        if (!state.sessionActive || state.startedAt === null) return { running: false }
        const now = Date.now()
        const clock = clockPatch(state, now)
        const clockFields = {
          remaining: clock.remaining,
          pendingMinutes: clock.pendingMinutes,
          lastTickAt: clock.lastTickAt,
        }
        if (r) {
          const pausedMs = state.pausedAt === null
            ? state.pausedMs
            : state.pausedMs + Math.max(0, now - state.pausedAt)
          return {
            ...clockFields,
            running: true,
            pausedAt: null,
            pausedMs,
            lastTickAt: now,
          }
        }
        return {
          ...clockFields,
          running: false,
          pausedAt: state.pausedAt ?? now,
        }
      }),
      setMinimized: (m) => set({ minimized: m }),

      reconcile: (now = Date.now()) => set((state) => {
        if (!state.sessionActive) return state
        const clock = clockPatch(state, now)
        return {
          remaining: clock.remaining,
          pendingMinutes: clock.pendingMinutes,
          lastTickAt: clock.lastTickAt,
        }
      }),

      tick: () => get().reconcile(),

      restartSession: () => set((state) => {
        const now = Date.now()
        const hasSkill = !!state.skillName
        const carriedMinutes = state.pendingMinutes
        return {
          sessionActive: hasSkill,
          remaining: FORGE_AMBIENT_DURATION,
          running: hasSkill,
          minimized: false,
          dismissed: false,
          startedAt: hasSkill ? now : null,
          pausedAt: null,
          pausedMs: 0,
          claimedMinutes: 0,
          carriedMinutes,
          pendingMinutes: carriedMinutes,
          lastTickAt: hasSkill ? now : null,
        }
      }),

      resetSession: () => set({
        sessionActive: false,
        skillName: null,
        skillId: null,
        running: false,
        remaining: FORGE_AMBIENT_DURATION,
        pendingMinutes: 0,
        startedAt: null,
        pausedAt: null,
        pausedMs: 0,
        claimedMinutes: 0,
        carriedMinutes: 0,
        lastTickAt: null,
      }),

      dismiss: () => set((state) => {
        const now = Date.now()
        const clock = clockPatch(state, now)
        return {
          remaining: clock.remaining,
          pendingMinutes: clock.pendingMinutes,
          lastTickAt: clock.lastTickAt,
          dismissed: true,
          running: false,
          pausedAt: state.sessionActive ? now : null,
        }
      }),

      markClaimed: (minutes) => set((state) => ({
        claimedMinutes: state.claimedMinutes + Math.max(0, Math.floor(minutes)),
        pendingMinutes: Math.max(0, state.pendingMinutes - minutes),
      })),
    }),
    {
      name: "myro-forge-timer-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        skillName: state.skillName,
        skillId: state.skillId,
        sessionActive: state.sessionActive,
        running: state.running,
        remaining: state.remaining,
        pendingMinutes: state.pendingMinutes,
        startedAt: state.startedAt,
        pausedAt: state.pausedAt,
        pausedMs: state.pausedMs,
        claimedMinutes: state.claimedMinutes,
        carriedMinutes: state.carriedMinutes,
        lastTickAt: state.lastTickAt,
        // dismissed + minimized are UI-only, recompute on load
      }),
      version: 2,
      migrate: (persistedState) => {
        const state = persistedState as ForgeTimerPersistedFields
        if (!state.sessionActive || typeof state.startedAt === "number") return state

        const now = Date.now()
        const remaining = typeof state.remaining === "number" ? state.remaining : FORGE_AMBIENT_DURATION
        const elapsedMs = Math.max(0, FORGE_AMBIENT_DURATION - remaining) * 1000
        const earnedMinutes = Math.floor(elapsedMs / 60_000)
        const pendingMinutes = Math.max(0, Math.floor(state.pendingMinutes ?? 0))
        return {
          ...state,
          startedAt: now - elapsedMs,
          pausedAt: state.running ? null : now,
          pausedMs: 0,
          claimedMinutes: Math.max(0, earnedMinutes - pendingMinutes),
          carriedMinutes: 0,
          lastTickAt: now,
        }
      },
    },
  ),
)

export function pendingXpFromMinutes(minutes: number, sessionType: ForgeSessionType = "ambient"): number {
  return minutes * forgeRateFor(sessionType)
}
