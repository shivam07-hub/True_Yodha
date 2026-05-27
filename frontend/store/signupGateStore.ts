import { create } from "zustand"

export type SignupGateSurface =
  | "about_hero"
  | "cv_upload_tap"
  | "ghost_radar"
  | "share_deeplink"
  | "company_jobs_save"
  | "company_jobs_cta"
  | "manual"

export interface SignupGateOpenParams {
  surface: SignupGateSurface
  /** Same-origin path to send the user to after the auth round-trip. */
  next?: string | null
  /** Free-text reason for analytics — e.g. "score-comparison". */
  source?: string | null
}

interface SignupGateState {
  open: boolean
  surface: SignupGateSurface | null
  next: string | null
  source: string | null
  openedAt: number | null
  methodSeenCount: number
  openGate: (params: SignupGateOpenParams) => void
  closeGate: () => void
  noteMethodSeen: () => void
}

/**
 * Singleton store backing the canonical SignupModal mounted in AppShell.
 *
 * ADR-0006 §15 — mirrors the XPGate precedent. Any surface can call
 * `useSignupGate().open({ surface })` to fire the modal; the modal owns
 * focus, dismissal, and telemetry. Surfaces never reach into the auth
 * provider directly.
 */
export const useSignupGateStore = create<SignupGateState>((set) => ({
  open: false,
  surface: null,
  next: null,
  source: null,
  openedAt: null,
  methodSeenCount: 0,
  openGate: ({ surface, next, source }) =>
    set({
      open: true,
      surface,
      next: next ?? null,
      source: source ?? null,
      openedAt: Date.now(),
      methodSeenCount: 0,
    }),
  closeGate: () => set({ open: false }),
  noteMethodSeen: () =>
    set((s) => ({ methodSeenCount: s.methodSeenCount + 1 })),
}))
