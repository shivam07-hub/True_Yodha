"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import { useNextPath } from "@/components/auth/auth-page-shell"
import { PublicTopNav } from "@/components/public/top-nav"
import { OperatorPane } from "./operator-pane"
import { InstitutionPane } from "./institution-pane"
import "./enterprise-signup.css"

type Mode = "operators" | "institutions"

export function EnterpriseSignup({ initialMode = "operators" }: { initialMode?: Mode } = {}) {
  const next = useNextPath()
  const [mode, setMode] = useState<Mode>(initialMode)
  const opTabRef = useRef<HTMLButtonElement | null>(null)
  const instTabRef = useRef<HTMLButtonElement | null>(null)
  const pillRef = useRef<HTMLSpanElement | null>(null)

  // Honor #institutions deep-link on mount.
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash.replace("#", "") === "institutions") {
      setMode("institutions")
    }
  }, [])

  // Pre-auth signup is a white-mode surface (playground theme). Force light on
  // the root so a stale data-surface=dark from another page (e.g. /myrology)
  // can't leak through; restore whatever was set on unmount.
  useEffect(() => {
    const root = document.documentElement
    const prior = root.getAttribute("data-surface")
    root.setAttribute("data-surface", "light")
    return () => {
      if (prior) root.setAttribute("data-surface", prior)
    }
  }, [])

  const positionPill = useCallback((m: Mode) => {
    const tab = m === "operators" ? opTabRef.current : instTabRef.current
    const pill = pillRef.current
    if (!tab || !pill || !tab.parentElement) return
    const r = tab.getBoundingClientRect()
    const p = tab.parentElement.getBoundingClientRect()
    pill.style.left = `${r.left - p.left}px`
    pill.style.width = `${r.width}px`
  }, [])

  useLayoutEffect(() => { positionPill(mode) }, [mode, positionPill])
  useEffect(() => {
    const onResize = () => positionPill(mode)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [mode, positionPill])

  const select = (m: Mode) => {
    setMode(m)
    if (typeof window !== "undefined") history.replaceState(null, "", `#${m}`)
  }

  return (
    <div className="es-page">
      {/* Canonical public nav — identical to the homepage bar. Clicking "For
          Colleges" no longer swaps the whole menu; only the right CTA changes to
          the operators↔institutions mode toggle (authSlot). */}
      <PublicTopNav
        active={mode === "institutions" ? "institutions" : undefined}
        showSignIn
        authSlot={
          <button
            type="button"
            className="tm-public-nav-signup"
            onClick={() => select(mode === "operators" ? "institutions" : "operators")}
          >
            {mode === "operators" ? "For institutions →" : "For operators →"}
          </button>
        }
      />

      <div className="es-switcher-wrap">
        <div className="es-switcher-eyebrow">Pick the right onboarding</div>
        <div className="es-switcher" role="tablist" aria-label="Account type">
          <span className="es-switcher-pill" ref={pillRef} aria-hidden="true" />
          <button
            type="button" className="es-switcher-btn" role="tab"
            aria-selected={mode === "operators"} ref={opTabRef}
            onClick={() => select("operators")}
          >
            <svg className="es-switcher-icon" viewBox="0 0 24 24"><path d="M2 9l10-5 10 5-10 5L2 9z" /><path d="M6 11v4c0 1.5 2.7 3 6 3s6-1.5 6-3v-4" /><path d="M22 9v6" /></svg>
            For operators
          </button>
          <button
            type="button" className="es-switcher-btn" role="tab"
            aria-selected={mode === "institutions"} ref={instTabRef}
            onClick={() => select("institutions")}
          >
            <svg className="es-switcher-icon" viewBox="0 0 24 24"><path d="M3 21h18M5 21V8l7-4 7 4v13M9 12h2M13 12h2M9 16h2M13 16h2" /></svg>
            For institutions
          </button>
        </div>
      </div>

      <main className="es-main">
        {mode === "operators"
          ? <OperatorPane active next={next} />
          : <InstitutionPane />}
      </main>

      <footer className="es-footer">
        <div className="es-foot-inner">
          <div className="es-foot-left">
            <span>© Myro 2026</span>
            <span className="es-foot-status"><span className="es-live-dot" aria-hidden="true" /> All systems operational</span>
          </div>
          <div className="es-foot-right">
            <Link className="es-foot-link" href="/newsletter">Newsletter</Link>
            <Link className="es-foot-link" href="/signup/institutions">For institutions</Link>
            <Link className="es-foot-link" href="/privacy">Privacy</Link>
            <Link className="es-foot-link" href="/terms">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
