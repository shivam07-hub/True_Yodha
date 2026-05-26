"use client"

import { Suspense, type ReactNode } from "react"
import { useSearchParams } from "next/navigation"
import { MyroLogo } from "@/components/myro-logo"
import { ParticleBg } from "@/components/particle-bg"
import { PublicFooter } from "@/components/public/public-footer"
import { SurfaceToggle } from "@/components/surface-toggle"

/**
 * ADR-0006 — page shell shared by /signup + /login + /auth/callback.
 *
 * Owns the chrome (logo, particle bg, theme toggle, footer). The form
 * itself is injected via children so each page can render a different
 * component without duplicating layout.
 */
interface Props {
  title: string
  subtitle?: string
  children: ReactNode
  footerCopy?: ReactNode
}

function nextFromQuery(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/")) return null
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null
  return raw
}

export function AuthPageShell({ title, subtitle, children, footerCopy }: Props) {
  return (
    <main style={{
      minHeight: "100dvh",
      display: "flex",
      flexDirection: "column",
      position: "relative",
      background: "var(--tm-bg)",
    }}>
      <ParticleBg />
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "28px 18px",
        position: "relative",
        zIndex: 2,
      }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: 22,
          }}>
            <div style={{ marginBottom: 10, filter: "drop-shadow(0 0 12px var(--tm-int-bg-hover))" }}>
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
              CV hub for live jobs
            </div>
          </div>

          <div style={{
            background: "var(--tm-surface)",
            border: "1px solid var(--tm-border-soft)",
            borderRadius: 18,
            padding: 26,
            boxShadow: "var(--tm-shadow-2)",
          }}>
            <h1 style={{
              fontSize: 24, lineHeight: 1.18, fontWeight: 700, color: "var(--tm-text)",
              marginBottom: subtitle ? 6 : 16, letterSpacing: "-0.015em",
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

          <div style={{
            marginTop: 14,
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 10,
          }}>
            <span style={{
              fontSize: 11, fontWeight: 700,
              letterSpacing: "0.08em", textTransform: "uppercase",
              color: "var(--tm-text-faint)",
            }}>Background</span>
            <SurfaceToggle />
          </div>
        </div>
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
