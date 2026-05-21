import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
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
  lastTickAt: number | null  // ms epoch — used to credit wall-clock minutes if tab was hidden

  // Actions
  startSession: (skill: CartSkill | { skill_name: string; skill_id?: string | null }) => void
  setRunning: (r: boolean) => void
  setMinimized: (m: boolean) => void
  tick: () => void
  restartSession: () => void
  resetSession: () => void
  dismiss: () => void
  markClaimed: (minutes: number) => void
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
      lastTickAt: null,

      startSession: (skill) => {
        const skill_id = "skill_id" in skill ? skill.skill_id ?? null : null
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
          pendingMinutes: get().skillName === skill.skill_name ? get().pendingMinutes : 0,
          lastTickAt: Date.now(),
        })
      },

      setRunning: (r) => set({ running: r, lastTickAt: r ? Date.now() : null }),
      setMinimized: (m) => set({ minimized: m }),

      tick: () => set((state) => {
        if (!state.running) return state
        const next = state.remaining - 1
        const prevWhole = Math.floor((FORGE_AMBIENT_DURATION - state.remaining) / 60)
        const nextWhole = Math.floor((FORGE_AMBIENT_DURATION - next) / 60)
        const minuteGained = nextWhole > prevWhole ? 1 : 0
        if (next <= 0) {
          // Hit the 25-min boundary — reset for the next unit, keep accumulating XP.
          return {
            remaining: FORGE_AMBIENT_DURATION,
            pendingMinutes: state.pendingMinutes + minuteGained,
            lastTickAt: Date.now(),
          }
        }
        return {
          remaining: next,
          pendingMinutes: state.pendingMinutes + minuteGained,
          lastTickAt: Date.now(),
        }
      }),

      restartSession: () => set((state) => ({
        sessionActive: !!state.skillName,
        remaining: FORGE_AMBIENT_DURATION,
        running: !!state.skillName,
        minimized: false,
        dismissed: false,
        lastTickAt: Date.now(),
      })),

      resetSession: () => set({
        sessionActive: false,
        skillName: null,
        skillId: null,
        running: false,
        remaining: FORGE_AMBIENT_DURATION,
        pendingMinutes: 0,
        lastTickAt: null,
      }),

      dismiss: () => set({ dismissed: true, running: false, lastTickAt: null }),

      markClaimed: (minutes) => set((state) => ({
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
        // dismissed + minimized are UI-only, recompute on load
      }),
    },
  ),
)

export function pendingXpFromMinutes(minutes: number, sessionType: ForgeSessionType = "ambient"): number {
  return minutes * forgeRateFor(sessionType)
}
