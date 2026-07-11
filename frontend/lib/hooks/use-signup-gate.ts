"use client"

import { useCallback } from "react"
import { useSignupGateStore, type SignupGateOpenParams } from "@/store/signupGateStore"
import { trackEvent } from "@/lib/analytics"
import { stashPendingJobSave } from "@/lib/anon-job-stash"

/**
 * ADR-0006 §15 — useSignupGate hook.
 *
 * Any high-intent surface that needs to gate behind auth calls
 * `open({ surface })` to fire the canonical SignupModal. Telemetry
 * (signup_modal_shown) fires once per open.
 */
export function useSignupGate() {
  const openGate = useSignupGateStore((s) => s.openGate)
  const closeGate = useSignupGateStore((s) => s.closeGate)
  const isOpen = useSignupGateStore((s) => s.open)

  const open = useCallback(
    (params: SignupGateOpenParams) => {
      // Carry an anon Save intent across the auth round-trip (Exception 2): the
      // job is replayed + saved post-login and the user lands on Collections.
      if (params.pendingJobId) stashPendingJobSave(params.pendingJobId)
      openGate(params)
      const hasRef = typeof window !== "undefined" && /\bmyro_ref=/.test(document.cookie)
      trackEvent("signup_modal_shown", {
        surface: params.surface,
        has_ref: hasRef ? "1" : "0",
        source: params.source ?? "",
      })
    },
    [openGate],
  )

  return { open, close: closeGate, isOpen }
}
