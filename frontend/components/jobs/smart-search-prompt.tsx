"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Search, X } from "lucide-react"
import { openRefreshGate } from "@/store/refreshGateStore"

/**
 * Smart Myro Search prompt — the debounced login nudge. Fires ONCE per ~24h,
 * and only when there's genuinely new inventory to search AND the user is
 * set up to be matched (onboarding done + a CV on file). It never charges —
 * "Run" just opens the pre-flight gate, where consent + the 100-coin charge live.
 */

const KEY = "myro_search_prompt_v1"
const DEBOUNCE_MS = 24 * 60 * 60 * 1000

export function SmartSearchPrompt({
  onboardingComplete,
  hasCv,
  newJobsCount,
}: {
  onboardingComplete: boolean
  hasCv: boolean
  newJobsCount: number
}) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!onboardingComplete || !hasCv || newJobsCount <= 0) return
    if (typeof window === "undefined") return
    const last = Number(window.localStorage.getItem(KEY) ?? 0)
    if (Date.now() - last < DEBOUNCE_MS) return
    window.localStorage.setItem(KEY, String(Date.now()))
    setShow(true)
  }, [onboardingComplete, hasCv, newJobsCount])

  if (!show || typeof document === "undefined") return null

  return createPortal(
    <div
      role="dialog"
      aria-label="Run a Myro Search"
      style={{
        position: "fixed",
        right: 20,
        bottom: 20,
        zIndex: 400,
        width: "min(340px, calc(100vw - 40px))",
        background: "var(--tm-surface)",
        border: "1px solid var(--tm-int-border)",
        borderRadius: 14,
        boxShadow: "0 18px 48px rgba(0,0,0,0.45)",
        padding: "16px 18px",
        animation: "tm-ssp-rise 220ms var(--tm-ease) both",
      }}
    >
      <style>{`
        @keyframes tm-ssp-rise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
        @media (prefers-reduced-motion: reduce) { [role="dialog"][aria-label="Run a Myro Search"] { animation: none !important } }
      `}</style>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setShow(false)}
        style={{ position: "absolute", top: 8, right: 10, background: "transparent", border: "none", color: "var(--tm-interactive-rest)", cursor: "pointer", padding: 2, lineHeight: 1 }}
      >
        <X size={16} aria-hidden />
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Search size={15} aria-hidden style={{ color: "var(--tm-interactive)" }} />
        <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-interactive)" }}>
          Myro Ops
        </span>
      </div>
      <p style={{ margin: "0 0 12px", fontSize: 13.5, color: "var(--tm-text)", lineHeight: 1.5 }}>
        <strong>{newJobsCount}</strong> new {newJobsCount === 1 ? "role" : "roles"} landed since your last search.
        Run a Myro Search to see the ones that fit.
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          type="button"
          onClick={() => setShow(false)}
          style={{ background: "transparent", border: "1px solid var(--tm-border-soft)", borderRadius: 8, padding: "7px 12px", color: "var(--tm-text-muted)", fontSize: 13, cursor: "pointer" }}
        >
          Later
        </button>
        <button
          type="button"
          onClick={() => { setShow(false); openRefreshGate() }}
          style={{ background: "var(--tm-interactive)", border: "1px solid var(--tm-interactive)", borderRadius: 8, padding: "7px 12px", color: "var(--tm-accent-ink, #04211c)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          Run Myro Search
        </button>
      </div>
    </div>,
    document.body,
  )
}
