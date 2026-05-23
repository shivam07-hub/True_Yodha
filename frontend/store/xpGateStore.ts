import { create } from "zustand"

interface XPGateState {
  open: boolean
  cost: number
  action: string
  openGate: (params: { cost: number; action: string }) => void
  closeGate: () => void
}

/**
 * Singleton store backing the canonical insufficient-XP modal.
 *
 * Decision context: Ousterhout audit 2026-05-23 — XP cost policy was
 * leaked across 5 call sites each with their own insufficient-funds UX.
 * This store + <XPGateModal/> + use-xp-gate hook collapse the policy
 * into one deep module.
 */
export const useXPGateStore = create<XPGateState>((set) => ({
  open: false,
  cost: 0,
  action: "",
  openGate: ({ cost, action }) => set({ open: true, cost, action }),
  closeGate: () => set({ open: false }),
}))
