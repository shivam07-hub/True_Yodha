import { create } from "zustand"
import type { CartSkill } from "@/types/xp"

export const FORGE_AMBIENT_DURATION = 25 * 60  // fixed 25 min for mini timer
export const FORGE_AMBIENT_RATE = 2             // XP per minute
export const FORGE_FOCUSED_RATE = 3             // XP per minute

interface ForgeTimerStore {
  sessionActive: boolean
  skillName: string | null
  skillLevelFrom: number
  skillLevelTo: number
  skillCompany: string | undefined
  remaining: number
  running: boolean
  minimized: boolean
  dismissed: boolean
  startSession: (skill: CartSkill) => void
  setRunning: (r: boolean) => void
  setMinimized: (m: boolean) => void
  tick: () => void
  resetSession: () => void
  dismiss: () => void
}

export const useForgeTimerStore = create<ForgeTimerStore>((set) => ({
  sessionActive: false,
  skillName: null,
  skillLevelFrom: 0,
  skillLevelTo: 1,
  skillCompany: undefined,
  remaining: FORGE_AMBIENT_DURATION,
  running: false,
  minimized: false,
  dismissed: false,

  startSession: (skill) => set({
    sessionActive: true,
    skillName: skill.skill_name,
    skillLevelFrom: skill.level_from ?? 0,
    skillLevelTo: skill.level_to ?? 1,
    skillCompany: skill.company,
    remaining: FORGE_AMBIENT_DURATION,
    running: false,
    minimized: false,
    dismissed: false,
  }),

  setRunning: (r) => set({ running: r }),
  setMinimized: (m) => set({ minimized: m }),

  tick: () => set((state) => {
    if (!state.running) return state
    const next = state.remaining - 1
    if (next <= 0) return { remaining: 0, running: false }
    return { remaining: next }
  }),

  resetSession: () => set({
    sessionActive: false,
    skillName: null,
    running: false,
    remaining: FORGE_AMBIENT_DURATION,
  }),

  dismiss: () => set({ dismissed: true, running: false }),
}))
