import { create } from "zustand"

/**
 * Singleton open-signal for the Myro Search modal.
 *
 * ONE DOOR. /market used to carry two buttons side by side — "Not it? Tell
 * Myro →" (a bottom sheet that talked to `/preflight/proposals`) and "Myro
 * Search" (this modal, which talks to `/preflight/proposals` and then runs).
 * Two surfaces, two vocabularies, two mental models, one Order and one engine
 * behind both. A user who told the sheet what was wrong then had to find the
 * other button to make it count.
 *
 * So there is one modal with two ways in, and the difference between them is
 * only where it lands:
 *
 *   "review" — the slots. "Here is what I'll search for. Right?"
 *   "say"    — the composer. "Something's off. Tell me."
 *
 * Callers only flip the signal. The gate — <PreflightGate/>, mounted once by
 * `useMyroSearch` where the profile and refresh VM live — owns everything else.
 */

/** Where the modal lands when it opens. */
export type GateIntent = "review" | "say"

interface RefreshGateState {
  open: boolean
  intent: GateIntent
  openRefreshGate: (intent?: GateIntent) => void
  closeRefreshGate: () => void
}

export const useRefreshGateStore = create<RefreshGateState>((set) => ({
  open: false,
  intent: "review",
  openRefreshGate: (intent: GateIntent = "review") => set({ open: true, intent }),
  closeRefreshGate: () => set({ open: false }),
}))

/** Convenience — call from anywhere without importing the hook. */
export const openRefreshGate = (intent: GateIntent = "review") =>
  useRefreshGateStore.getState().openRefreshGate(intent)
