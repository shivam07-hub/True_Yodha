"use client"

import { useCallback } from "react"
import { useSignupGateStore, type SignupGateOpenParams } from "@/store/signupGateStore"
import { trackEvent } from "@/lib/analytics"

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
