"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"

/* ══════════════════════════════════════════════════════════════════════════
   MobileUIProvider — the two GLOBAL overlays of the mobile redesign: the
   snackbar (toast + optional action + timer bar) and the Practice sheet trigger
   (top-bar bolt). Both live once in the shell so any surface can fire them.
   Ported to the dot from the handoff's `_snack` + practice-sheet state.
   ══════════════════════════════════════════════════════════════════════════ */

export interface SnackSpec {
  msg: string
  action?: string
  onAction?: () => void
  ms?: number
}

interface MobileUICtx {
  snack: (spec: SnackSpec) => void
  closeSnack: () => void
  openPractice: () => void
  closePractice: () => void
  practiceOpen: boolean
}

const Ctx = createContext<MobileUICtx | null>(null)

export function useMobileUI(): MobileUICtx {
  const v = useContext(Ctx)
  if (!v) throw new Error("useMobileUI must be used inside <MobileUIProvider>")
  return v
}

/** Convenience — just the snackbar fire. */
export function useSnack() {
  return useMobileUI().snack
}

interface SnackState extends SnackSpec {
  scale: number
  tr: string
}

export function MobileUIProvider({ children }: { children: React.ReactNode }) {
  const [snackState, setSnackState] = useState<SnackState | null>(null)
  const [practiceOpen, setPracticeOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const closeSnack = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    setSnackState(null)
  }, [])

  const snack = useCallback((spec: SnackSpec) => {
    const ms = spec.ms ?? 4600
    if (timer.current) clearTimeout(timer.current)
    setSnackState({ ...spec, scale: 1, tr: "none" })
    // Two RAFs so the compositor-only timer animates from full → empty.
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        setSnackState(s => (s ? { ...s, scale: 0, tr: `transform ${ms}ms linear` } : s)),
      ),
    )
    timer.current = setTimeout(() => setSnackState(null), ms)
  }, [])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const openPractice = useCallback(() => setPracticeOpen(true), [])
  const closePractice = useCallback(() => setPracticeOpen(false), [])

  return (
    <Ctx.Provider value={{ snack, closeSnack, openPractice, closePractice, practiceOpen }}>
      {children}
      {snackState && (
        <div
          className="mm-root"
          role="status"
          aria-live="polite"
          style={{
            position: "fixed", left: 14, right: 14,
            bottom: "calc(var(--tm-mobile-bottomnav-h, 62px) + 12px + env(safe-area-inset-bottom))",
            zIndex: 260, background: "var(--tm-border)", border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: 14, boxShadow: "0 10px 30px rgba(0,0,0,0.45)", overflow: "hidden",
            animation: "mm-snackIn 180ms ease-out",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px" }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 550, color: "var(--mm-text)" }}>{snackState.msg}</span>
            {snackState.action && (
              <button
                onClick={() => snackState.onAction?.()}
                style={{ border: "none", background: "transparent", color: "var(--mm-accent)", fontSize: 13, fontWeight: 750, cursor: "pointer", fontFamily: "inherit", padding: "2px" }}
              >
                {snackState.action}
              </button>
            )}
          </div>
          <div style={{ height: 2, background: "var(--mm-accent)", transform: `scaleX(${snackState.scale})`, transformOrigin: "left", transition: snackState.tr }} />
        </div>
      )}
    </Ctx.Provider>
  )
}
