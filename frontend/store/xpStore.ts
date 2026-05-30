import { create } from "zustand"

export interface XpDelta {
  /** Signed change applied (−10 spend, +30 earn). Never 0. */
  delta: number
  /** Action that produced the change (analyse_job, follow_company, …). */
  action: string
  /** Monotonic id so a repeat delta still retriggers the float animation. */
  id: number
}

interface XPStore {
  balance: number
  /** Transient last change, consumed by the pill nudge. Cleared after animation. */
  lastDelta: XpDelta | null
  setBalance: (n: number) => void
  addBalance: (n: number) => void
  subtractBalance: (n: number) => void
  /**
   * Set the balance to an authoritative server value AND surface the delta as a
   * pill nudge. Use at every XP charge/earn site instead of bare setBalance —
   * the nudge is derived from the explicit (old → new) move, never auto-diffed
   * from setBalance (initial 0→3000 hydration must not fake a +3000 float).
   * `silent` suppresses the float (e.g. forge claim owns its own celebration).
   */
  applyXpChange: (opts: { newBalance: number; action: string; silent?: boolean }) => void
  clearDelta: () => void
}

let _deltaSeq = 0

export const useXPStore = create<XPStore>((set, get) => ({
  balance: 0,
  lastDelta: null,
  setBalance: (n) => set({ balance: n }),
  addBalance: (n) => set((state) => ({ balance: state.balance + n })),
  subtractBalance: (n) => set((state) => ({ balance: Math.max(0, state.balance - n) })),
  applyXpChange: ({ newBalance, action, silent }) => {
    const delta = newBalance - get().balance
    if (silent || delta === 0) {
      set({ balance: newBalance })
      return
    }
    set({ balance: newBalance, lastDelta: { delta, action, id: ++_deltaSeq } })
  },
  clearDelta: () => set({ lastDelta: null }),
}))
