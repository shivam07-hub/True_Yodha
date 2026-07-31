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
  source: string | null
  openedAt: number | null
  methodSeenCount: number
  /** Email carried across a signup→login flip so the user never retypes it. */
  prefillEmail: string | null
  openGate: (params: SignupGateOpenParams) => void
  closeGate: () => void
  /** In-modal signup⇄login toggle — flips the view, keeps telemetry/openedAt. */
  setMode: (mode: SignupGateMode, prefillEmail?: string | null) => void
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
  source: null,
  openedAt: null,
  methodSeenCount: 0,
  prefillEmail: null,
  openGate: ({ surface, mode, source }) =>
    set({
      open: true,
      mode: mode ?? "signup",
      surface,
      source: source ?? null,
      openedAt: Date.now(),
      methodSeenCount: 0,
      prefillEmail: null,
    }),
  closeGate: () => set({ open: false, prefillEmail: null }),
  setMode: (mode, prefillEmail) => set({ mode, prefillEmail: prefillEmail ?? null }),
  noteMethodSeen: () =>
    set((s) => ({ methodSeenCount: s.methodSeenCount + 1 })),
}))
