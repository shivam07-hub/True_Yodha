"use client"

import Link from "next/link"
import type { CSSProperties } from "react"
import { Home, RefreshCw } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { PublicFooter } from "@/components/public/public-footer"
import { PublicTopNav } from "@/components/public/top-nav"

type ErrorSurface = "app" | "public"

interface AppRouteErrorProps {
  surface: ErrorSurface
  title: string
  reset: () => void
}

const panelStyle: CSSProperties = {
  width: "min(100%, 460px)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 16,
  padding: "40px 24px",
  textAlign: "center",
}

const actionRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexWrap: "wrap",
  gap: 10,
}

const buttonStyle: CSSProperties = {
  height: 38,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  borderRadius: "var(--tm-button-radius)",
  padding: "0 14px",
  border: "1px solid var(--tm-int-border)",
  background: "var(--tm-int-bg-wash)",
  color: "var(--tm-interactive)",
  fontFamily: "inherit",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
}

function ErrorPanel({
  title,
  reset,
  homeHref,
}: Pick<AppRouteErrorProps, "title" | "reset"> & { homeHref: string }) {
  return (
    <section aria-labelledby="route-error-title" style={panelStyle}>
      <div style={{ width: 44, height: 44, borderRadius: "var(--tm-panel-radius-lg)", display: "grid", placeItems: "center", border: "1px solid var(--tm-danger)", color: "var(--tm-danger)", background: "var(--tm-danger-wash)" }}>
        !
      </div>
      <div>
        <h1 id="route-error-title" style={{ margin: 0, color: "var(--tm-text)", fontSize: "var(--tm-fs-title)", lineHeight: "var(--tm-lh-title)", fontWeight: 700 }}>
          {title}
        </h1>
        {/* --tm-text-muted, not --tm-text-faint: faint is ~3:1 at 14px on the
            light paper, and this sentence is the only thing telling the user
            the failure is temporary and retryable. */}
        <p style={{ margin: "8px 0 0", color: "var(--tm-text-muted)", fontSize: 14, lineHeight: 1.5 }}>
          The page hit a temporary failure. Retry the route or return home.
        </p>
      </div>
      <div style={actionRowStyle}>
        <button type="button" onClick={reset} style={buttonStyle}>
          <RefreshCw size={15} aria-hidden />
          Retry
        </button>
        <Link href={homeHref} style={{ ...buttonStyle, background: "transparent", color: "var(--tm-text-muted)", borderColor: "var(--tm-border-soft)" }}>
          <Home size={15} aria-hidden />
          Home
        </Link>
      </div>
    </section>
  )
}

export function AppRouteError({ surface, title, reset }: AppRouteErrorProps) {
  if (surface === "public") {
    return (
      <div style={{ minHeight: "100dvh", width: "100vw", display: "flex", flexDirection: "column", background: "var(--tm-bg)", position: "relative", overflow: "hidden" }}>
        <PublicTopNav active="intel" showSignIn />
        <main style={{ flex: 1, display: "grid", placeItems: "center", padding: "var(--tm-page-py) var(--tm-page-px)", position: "relative", zIndex: 2 }}>
          <ErrorPanel title={title} reset={reset} homeHref="/" />
        </main>
        <PublicFooter />
      </div>
    )
  }

  return (
    <AppShell>
      <main style={{ minHeight: "100%", display: "grid", placeItems: "center", padding: "var(--tm-page-py) var(--tm-page-px)" }}>
        <ErrorPanel title={title} reset={reset} homeHref="/market" />
      </main>
    </AppShell>
  )
}
