"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useXPStore } from "@/store/xpStore"
import { useXPGateStore } from "@/store/xpGateStore"
import { trackEvent } from "@/lib/analytics"
import "./xp-gate-modal.css"

/**
 * Singleton insufficient-tokens modal. Mounted once in AppShell — never per
 * call site. Driven by useXPGateStore. The use-xp-gate hook pushes intent
 * to the store; this component renders the canonical "Not enough tokens"
 * dialog.
 *
 * Branch 2 lock (2026-05-24): generic copy + tokens guide link. Does not
 * suggest an earn path inline; routes the user to /xp via the existing
 * tokens guide content.
 */
export function XPGateModal() {
  const open = useXPGateStore((s) => s.open)
  const cost = useXPGateStore((s) => s.cost)
  const action = useXPGateStore((s) => s.action)
  const closeGate = useXPGateStore((s) => s.closeGate)
  const balance = useXPStore((s) => s.balance)

  // Esc key dismiss
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleDismiss()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  function handleDismiss() {
    trackEvent("xp_gate_modal_dismissed", { action, cost, balance })
    closeGate()
  }

  function handleGuide() {
    trackEvent("xp_gate_guide_opened", { action, cost, balance })
    closeGate()
  }

  return (
    <div
      className="tm-xp-gate-overlay"
      onClick={handleDismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="xp-gate-title"
    >
      <div className="tm-xp-gate-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="xp-gate-title" className="tm-xp-gate-title">Not enough tokens.</h2>
        <p className="tm-xp-gate-body">
          You need {cost}. You have {balance}.
        </p>
        <div className="tm-xp-gate-actions">
          <Link href="/tokens" className="tm-xp-gate-primary" onClick={handleGuide}>
            See how tokens work →
          </Link>
          <button type="button" className="tm-xp-gate-secondary" onClick={handleDismiss}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
