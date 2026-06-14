"use client"

import { Suspense, type ReactNode } from "react"
import { useSearchParams } from "next/navigation"
import { MyroLogo } from "@/components/myro-logo"
import { PublicFooter } from "@/components/public/public-footer"
import "@/components/public/landing/landing-engine.css"
import "./auth-page-shell.css"

/**
 * ADR-0006 — page shell shared by /signup + /login + /auth/callback.
 *
   * Owns the chrome (logo, theme toggle, footer). The form
 * itself is injected via children so each page can render a different
 * component without duplicating layout.
 *
 * `aside` adds a value panel beside the form (the sample readout) so every
 * auth surface shows what Myro does, not just a bare form. Stacks below the
 * form on narrow screens.
 */
interface Props {
  title: string
  subtitle?: string
  children: ReactNode
  footerCopy?: ReactNode
  aside?: ReactNode
}

function nextFromQuery(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/")) return null
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null
  return raw
}

export function AuthPageShell({ title, subtitle, children, footerCopy, aside }: Props) {
  const formPane = (
    <>
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: 22,
          }}>
            <div style={{ marginBottom: 10 }}>
              <MyroLogo size={42} />
            </div>
            <div style={{
              fontFamily: "var(--tm-font-display)",
              fontSize: 30, fontWeight: 600, color: "var(--tm-text)", lineHeight: 1,
            }}>Myro</div>
            <div style={{
              fontSize: 12, fontWeight: 600, color: "var(--tm-text-faint)",
              letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 6,
            }}>
              career intelligence
            </div>
          </div>

          <div style={{
            background: "var(--tm-surface)",
            border: "1px solid var(--tm-border-soft)",
            borderRadius: "var(--tm-panel-radius-lg)",
            padding: 26,
            boxShadow: "var(--tm-shadow-2)",
          }}>
            <h1 style={{
              fontSize: "var(--tm-fs-title)", lineHeight: "var(--tm-lh-title)", fontWeight: 700, color: "var(--tm-text)",
              marginBottom: subtitle ? 6 : 16, letterSpacing: 0,
            }}>{title}</h1>
            {subtitle && (
              <p style={{
                fontSize: 14.5, lineHeight: 1.55, color: "var(--tm-text-muted)",
                marginBottom: 18,
              }}>{subtitle}</p>
            )}
            {children}
          </div>

          {footerCopy && (
            <p style={{
              marginTop: 18, textAlign: "center", fontSize: 13,
              color: "var(--tm-text-faint)",
            }}>{footerCopy}</p>
          )}
    </>
  )

  return (
    <main style={{
      minHeight: "100dvh",
      display: "flex",
      flexDirection: "column",
      position: "relative",
      background: "var(--tm-bg)",
    }}>
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "28px 18px",
        position: "relative",
        zIndex: 2,
      }}>
        {aside ? (
          <div className="auth-shell-grid">
            <div className="auth-shell-form">{formPane}</div>
            <div className="auth-shell-aside">{aside}</div>
          </div>
        ) : (
          <div style={{ width: "100%", maxWidth: 380 }}>{formPane}</div>
        )}
      </div>
      <PublicFooter />
    </main>
  )
}

export function useNextPath(): string | null {
  const params = useSearchParams()
  return nextFromQuery(params.get("next"))
}

export function SuspenseWrap({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>
}
