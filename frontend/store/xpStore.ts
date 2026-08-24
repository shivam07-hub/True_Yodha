import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

interface XPStore {
  balance: number
  setBalance: (n: number) => void
  addBalance: (n: number) => void
  subtractBalance: (n: number) => void
  /**
   * Set the balance to an authoritative server value at a charge/earn site.
   *
   * It used to ALSO surface the move as a `−100` float off the XP pill, which
   * is why it takes `action` and exists apart from `setBalance`. That float
   * (`XpDeltaNudge`) was built, never mounted anywhere, and deleted on
   * 2026-08-23 — so `lastDelta`, `clearDelta` and the `silent` suppressor went
   * with it, and this is now `setBalance` with a name that says where it is
   * called from.
   *
   * Left as its own seam deliberately: collapsing it is a mechanical rename
   * across ~8 charge sites with no user-visible benefit, and it is the natural
   * mount point if the nudge is ever wired. `action` is kept for the same
   * reason — it is the one thing a bare `setBalance` cannot record.
   */
  applyXpChange: (opts: { newBalance: number; action: string }) => void
}

export const useXPStore = create<XPStore>()(
  persist(
    (set) => ({
  balance: 0,
  setBalance: (n) => set({ balance: n }),
  addBalance: (n) => set((state) => ({ balance: state.balance + n })),
  subtractBalance: (n) => set((state) => ({ balance: Math.max(0, state.balance - n) })),
  applyXpChange: ({ newBalance }) => set({ balance: newBalance }),
    }),
    {
      // Persist only the balance for this tab so the user avoids a "0" flash
      // while the authoritative fetch
      // resolves. skipHydration + rehydrate-on-mount (use-shell-model) avoids
      // an SSR/client hydration mismatch on the number. Wiped on logout.
      name: "myro_xp",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ balance: s.balance }),
      skipHydration: true,
    },
  ),
)
