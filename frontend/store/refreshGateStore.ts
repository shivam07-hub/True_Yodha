import { create } from "zustand"

/**
 * Singleton open-signal for the Match Refresh consent gate.
 *
 * Mirrors the xpGateStore precedent: callers (the Refresh button, the
 * "Refresh now" stale prompt) only flip `open`. The gate itself —
 * <MatchRefreshGate/>, mounted once where profile + refresh vm live — owns
 * all consent / edit / spend behaviour.
 *
 * The button's only job is openRefreshGate().
 */
interface RefreshGateState {
  open: boolean
  openRefreshGate: () => void
  closeRefreshGate: () => void
}

export const useRefreshGateStore = create<RefreshGateState>((set) => ({
  open: false,
  openRefreshGate: () => set({ open: true }),
  closeRefreshGate: () => set({ open: false }),
}))

/** Convenience — call from anywhere without importing the hook. */
export const openRefreshGate = () => useRefreshGateStore.getState().openRefreshGate()
