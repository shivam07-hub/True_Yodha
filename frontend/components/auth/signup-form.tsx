"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase"
import { capturePendingReferral } from "@/lib/referral"
import { detectInAppBrowser } from "@/lib/is-in-app-browser"
import { signupEvents } from "@/lib/analytics"
import { GoogleAuthButton } from "@/components/auth/shared/google-button"
import { LinkedInAuthButton } from "@/components/auth/shared/linkedin-button"
import { MagicLinkInput } from "@/components/auth/shared/magic-link-input"
import { CheckInboxPanel } from "@/components/auth/shared/check-inbox-panel"
import { InAppBrowserWarning } from "@/components/auth/shared/in-app-browser-warning"

interface Props {
  /** Where the form is mounted — used for telemetry + post-auth routing. */
  surface: "page" | "modal"
  /** Same-origin path to land on after auth completes. */
  next?: string | null
  /** Whether to render an alt "Sign in" link below the form (page only). */
  showLoginLink?: boolean
}

/**
 * ADR-0006 §14 — SignupForm.
 *
 * Three signup paths in locked order: Google → LinkedIn → magic-link.
 * Auth-before-file: file pickers are routed via ?upload=1 on the post-auth
 * destination (set by callers via `next`), no anon state to preserve.
 */
export function SignupForm({ surface, next, showLoginLink = true }: Props) {
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [agent, setAgent] = useState<string | null>(null)

  useEffect(() => {
    capturePendingReferral()
    const det = detectInAppBrowser()
    if (det.inApp) setAgent(det.agent)
  }, [])

  const redirectTo = useMemo(() => {
    if (typeof window === "undefined") return null
    const base = `${window.location.origin}/auth/callback`
    return next ? `${base}?next=${encodeURIComponent(next)}` : base
  }, [next])

  function openOAuth(provider: "google" | "linkedin_oidc") {
    if (agent && provider === "google") return // shouldn't render
    const supabase = createClient()
    setError(null)
    supabase.auth
      .signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectTo ?? undefined,
          scopes:
            provider === "linkedin_oidc"
              ? "openid profile email"
              : undefined,
        },
      })
      .then(({ error }) => {
        if (error) {
          signupEvents.failed({
            method: provider === "google" ? "google" : "linkedin",
            stage: "oauth_init",
            error_code: error.message.slice(0, 60),
          })
          setError(error.message)
        }
      })
  }

  if (pendingEmail) {
    return (
      <CheckInboxPanel
        email={pendingEmail}
        redirectTo={redirectTo}
        onChangeEmail={() => setPendingEmail(null)}
      />
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {agent && <InAppBrowserWarning agent={agent} />}

      {!agent && (
        <GoogleAuthButton
          surface={surface}
          onClick={() => openOAuth("google")}
        />
      )}

      <LinkedInAuthButton
        surface={surface}
        onClick={() => openOAuth("linkedin_oidc")}
      />

      <div style={{
        display: "flex", alignItems: "center", gap: 10, margin: "2px 0",
      }}>
        <div style={{ flex: 1, height: 1, background: "var(--tm-border-soft)" }} />
        <span style={{ fontSize: 12, color: "var(--tm-text-faint)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          or
        </span>
        <div style={{ flex: 1, height: 1, background: "var(--tm-border-soft)" }} />
      </div>

      <MagicLinkInput
        surface={surface}
        redirectTo={redirectTo}
        onSent={(email) => setPendingEmail(email)}
      />

      {error && (
        <p role="alert" style={{
          fontSize: 13, color: "var(--tm-danger)",
          padding: "8px 12px", borderRadius: 8,
          background: "var(--tm-danger-wash)",
          border: "1px solid rgba(251,113,133,0.25)",
        }}>{error}</p>
      )}

      <p style={{ fontSize: 11, color: "var(--tm-text-faint)", lineHeight: 1.55, textAlign: "center", margin: "2px 0 0", maxWidth: 420 }}>
        By creating an account, you agree to our{" "}
        <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "var(--tm-interactive)", textDecoration: "none" }}>Terms</a>{" "}
        and consent to Myro processing your email, uploaded CV, extracted skills, and saved jobs to provide the Service — including processing by our AI providers. You can withdraw consent or delete your data anytime from Settings. See our{" "}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "var(--tm-interactive)", textDecoration: "none" }}>Privacy Policy</a>.
      </p>

      <div style={{
        display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center",
        gap: 8, marginTop: 4,
      }}>
        <span style={{ fontSize: 12, color: "var(--tm-text-faint)", lineHeight: 1.55 }}>
          Free. Private. Yours.
        </span>
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="tm-auth-privacy-link"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2 4 5v6c0 4.4 3.1 8.5 8 9.7 4.9-1.2 8-5.3 8-9.7V5l-8-3Z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          Privacy policy
        </a>
      </div>

      {showLoginLink && surface === "page" && (
        <p style={{
          marginTop: 4, textAlign: "center", fontSize: 13, color: "var(--tm-text-faint)",
        }}>
          Already have an account?{" "}
          <Link
            href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
            style={{ color: "var(--tm-interactive)", textDecoration: "none" }}
          >
            Sign in
          </Link>
        </p>
      )}
    </div>
  )
}
