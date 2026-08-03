"use client"

import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { useSignupGateStore } from "@/store/signupGateStore"
import { signupEvents } from "@/lib/analytics"
import { subscribeToSessionChanges } from "@/lib/session"
import { getStoredReferral } from "@/lib/referral"
import { SignupForm } from "./signup-form"
import { LoginForm } from "./login-form"
import "./signup-modal.css"

const CONCEPTS: Array<{ title: string; body: string }> = [
  {
    title: "Score CV",
    body: "CV vs live jobs, scored 0-100.",
  },
  {
    title: "Tailor versions",
    body: "One master, role-specific copies.",
  },
  {
    title: "Save jobs",
    body: "Collect roles. Close skill gaps.",
  },
]

export function SignupModal() {
  const { open, mode, surface, prefillEmail, closeGate, setMode, openedAt, methodSeenCount } =
    useSignupGateStore()
  const isLogin = mode === "login"
  const dialogRef = useRef<HTMLDivElement | null>(null)

  /**
   * A session appearing while the gate is open means auth SUCCEEDED — by any
   * path (password signup, password login, or whatever we add next).
   *
   * This lives here, not in each form's success branch, because the modal is a
   * portal over the whole app with body scroll locked: a form that forgets to
   * close it does `router.push` underneath itself and the user lands on their
   * new dashboard behind a frozen scrim — signup worked, product looks broken.
   * That was the 2026-07-26 bug. Closing on the session event makes it
   * impossible for a future auth path to reintroduce.
   */
  useEffect(() => {
    if (!open) return
    return subscribeToSessionChanges((token) => {
      if (token) closeGate()
    })
  }, [open, closeGate])

  // Esc closes; click-outside intentionally does NOT (mobile misclick).
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        dismiss("esc")
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Initial focus to the first interactive element.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      const root = dialogRef.current
      const first = root?.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled])',
      )
      first?.focus()
    }, 60)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [open])

  function dismiss(_reason: "esc" | "x") {  // eslint-disable-line @typescript-eslint/no-unused-vars
    const timeOpenMs = openedAt ? Date.now() - openedAt : 0
    signupEvents.modalDismissed({
      surface: surface ?? "manual",
      method_seen_count: methodSeenCount,
      time_open_ms: timeOpenMs,
    })
    closeGate()
  }

  if (!open || typeof document === "undefined") return null

  const refSlug = typeof window !== "undefined" ? getStoredReferral() : null

  return createPortal(
    <div
      className="tm-signup-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tm-signup-modal-title"
    >
      <div className={`tm-signup-modal${isLogin ? " tm-signup-modal--single" : ""}`} ref={dialogRef}>
        <button
          type="button"
          className="tm-signup-modal__close"
          aria-label={isLogin ? "Close sign in" : "Close sign up"}
          onClick={() => dismiss("x")}
        >
          ×
        </button>

        <div className="tm-signup-modal__main">
          <span className="tm-signup-modal__crumb">
            <span className="tm-signup-modal__crumb-dot" />
            {isLogin ? "Sign in" : "Sign up · 30 seconds"}
          </span>
          <h2 id="tm-signup-modal-title" className="tm-signup-modal__title">
            {isLogin ? (
              <>Welcome <em>back</em>.</>
            ) : (
              <>Start your <em>CV hub</em>.</>
            )}
          </h2>
          {!isLogin && (
            <p className="tm-signup-modal__lead">
              Score. Tailor. Apply.
            </p>
          )}

          {!isLogin && refSlug && (
            <span className="tm-signup-modal__ref-chip">
              Invited by <strong>@{refSlug}</strong>
            </span>
          )}

          {isLogin ? (
            <LoginForm
              surface="modal"
              showSignupLink={false}
              initialEmail={prefillEmail}
            />
          ) : (
            <SignupForm
              surface="modal"
              showLoginLink={false}
              // Existing account → flip to sign-in in place, email carried
              // over. Sending them to /login would drop the surface they came
              // from.
              onEmailTaken={(email) => setMode("login", email)}
            />
          )}

          <p className="tm-signup-modal__toggle">
            {isLogin ? (
              <>
                New here?{" "}
                <button type="button" onClick={() => setMode("signup")}>
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button type="button" onClick={() => setMode("login")}>
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>

        {!isLogin && (
          <aside
            className="tm-signup-modal__aside"
            aria-label="What you will get"
          >
            <div className="tm-signup-modal__aside-head">
              <span className="tm-signup-modal__aside-eyebrow">
                What you&apos;ll get
              </span>
              <button
                type="button"
                className="tm-signup-modal__aside-close"
                aria-label="Close sign up"
                onClick={() => dismiss("x")}
              >
                ×
              </button>
            </div>
            <div className="tm-signup-modal__aside-glyph" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="9" y1="13" x2="15" y2="13" />
                <line x1="9" y1="17" x2="13" y2="17" />
              </svg>
            </div>
            {CONCEPTS.map((c) => (
              <div className="tm-signup-modal__concept" key={c.title}>
                <h4>{c.title}</h4>
                <p>{c.body}</p>
              </div>
            ))}
            <p className="tm-signup-modal__trust">Any email works.</p>
          </aside>
        )}
      </div>
    </div>,
    document.body,
  )
}
