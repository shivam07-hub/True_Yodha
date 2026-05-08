import { create } from "zustand"

interface XPStore {
  balance: number
  setBalance: (n: number) => void
  addBalance: (n: number) => void
  subtractBalance: (n: number) => void
}

export const useXPStore = create<XPStore>((set) => ({
  balance: 0,
  setBalance: (n) => set({ balance: n }),
  addBalance: (n) => set((state) => ({ balance: state.balance + n })),
  subtractBalance: (n) => set((state) => ({ balance: Math.max(0, state.balance - n) })),
}))
