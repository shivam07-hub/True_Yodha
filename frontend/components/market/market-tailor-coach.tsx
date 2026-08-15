"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { trackEvent } from "@/lib/analytics"

const STORAGE_KEY = "myro.market.tailor-coach.dismissed"

/**
 * Enterprise-style tip on first Market land after onboarding — quiet, dismissible,
 * next to the work. Cursor-like: one tip, one action, no modal.
 */
export function MarketTailorCoach({ enabled }: { enabled: boolean }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return
    if (window.localStorage.getItem(STORAGE_KEY)) return
    setVisible(true)
  }, [enabled])

  if (!visible) return null

  function dismiss() {
    window.localStorage.setItem(STORAGE_KEY, "1")
    setVisible(false)
    trackEvent("market_tailor_coach_dismissed")
  }

  return (
    <aside
      className="mb-4 flex items-start gap-3 rounded-md border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] px-4 py-3"
      aria-label="Tip"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--tm-text)]">Open a role, then tailor your CV</p>
        <p className="mt-1 text-pretty text-sm leading-5 text-[var(--tm-text-muted)]">
          Your matches land here. Pick one that fits, then tailor your CV to that opening.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="tm-control-focus -mr-1 -mt-1 grid size-9 shrink-0 place-items-center rounded text-[var(--tm-text-muted)] hover:text-[var(--tm-text)]"
        aria-label="Dismiss tip"
      >
        <X className="size-4" />
      </button>
    </aside>
  )
}
