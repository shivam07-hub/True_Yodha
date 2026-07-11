import { create } from "zustand"

export type SignupGateSurface =
  | "about_hero"
  | "cv_upload_tap"
  | "ghost_radar"
  | "share_deeplink"
  | "company_jobs_save"
  | "company_jobs_cta"
  | "intel_save"
  | "manual"

/** Which auth view the modal opens in. Returning users → "login". */
export type SignupGateMode = "signup" | "login"

export interface SignupGateOpenParams {
  surface: SignupGateSurface
  /** Which view to open in. Defaults to "signup" (conversion-first). */
  mode?: SignupGateMode
  /** Same-origin path to send the user to after the auth round-trip. */
  next?: string | null
  /** Free-text reason for analytics — e.g. "score-comparison". */
  source?: string | null
  /** A job the anon user tried to save. Stashed on open, replayed post-login →
   *  the job is saved and the user lands on Collections (Exception 2). */
  pendingJobId?: string | null
}

interface SignupGateState {
  open: boolean
  mode: SignupGateMode
  surface: SignupGateSurface | null
  next: string | null
  source: string | null
  openedAt: number | null
  methodSeenCount: number
  openGate: (params: SignupGateOpenParams) => void
  closeGate: () => void
  /** In-modal signup⇄login toggle — flips the view, keeps telemetry/openedAt. */
  setMode: (mode: SignupGateMode) => void
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
  mode: "signup",
  surface: null,
  next: null,
  source: null,
  openedAt: null,
  methodSeenCount: 0,
  openGate: ({ surface, mode, next, source }) =>
    set({
      open: true,
      mode: mode ?? "signup",
      surface,
      next: next ?? null,
      source: source ?? null,
      openedAt: Date.now(),
      methodSeenCount: 0,
    }),
  closeGate: () => set({ open: false }),
  setMode: (mode) => set({ mode }),
  noteMethodSeen: () =>
    set((s) => ({ methodSeenCount: s.methodSeenCount + 1 })),
}))
