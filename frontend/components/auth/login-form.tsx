"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { auth } from "@/lib/api"
import { setSessionTokens } from "@/lib/session"
import { createClient } from "@/lib/supabase"
import { capturePendingReferral } from "@/lib/referral"
import { appendAttributionToUrl, capturePendingAttribution } from "@/lib/attribution"
import { detectInAppBrowser } from "@/lib/is-in-app-browser"
import { signupEvents } from "@/lib/analytics"
import { hasPendingAnonCvClaim } from "@/lib/anon-cv-claim"
import { hasPendingJobSaveClaim } from "@/lib/anon-job-stash"
import { postAuthDestination } from "@/lib/auth/post-auth-destination"
import { GoogleAuthButton } from "@/components/auth/shared/google-button"
import { LinkedInAuthButton } from "@/components/auth/shared/linkedin-button"
import { MagicLinkInput } from "@/components/auth/shared/magic-link-input"
import { CheckInboxPanel } from "@/components/auth/shared/check-inbox-panel"
import { InAppBrowserWarning } from "@/components/auth/shared/in-app-browser-warning"

interface Props {
  surface: "page" | "modal"
  next?: string | null
  showSignupLink?: boolean
}

/**
 * ADR-0006 §14 — LoginForm.
 *
 * Four login paths: Google + LinkedIn + magic-link + password (legacy).
 * Magic-link is the canonical forgot-password recovery path.
 */
export function LoginForm({ surface, next, showSignupLink = true }: Props) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [agent, setAgent] = useState<string | null>(null)
  const [mode, setMode] = useState<"primary" | "password">("primary")

  useEffect(() => {
    capturePendingReferral()
    capturePendingAttribution()
    const det = detectInAppBrowser()
    if (det.inApp) setAgent(det.agent)
  }, [])

  const redirectTo = useMemo(() => {
    if (typeof window === "undefined") return null
    const base = `${window.location.origin}/auth/callback`
    return appendAttributionToUrl(next ? `${base}?next=${encodeURIComponent(next)}` : base)
  }, [next])

  function openOAuth(provider: "google" | "linkedin_oidc") {
    if (agent && provider === "google") return
    const supabase = createClient()
    setError(null)
    supabase.auth
      .signInWithOAuth({
        provider,
        options: { redirectTo: redirectTo ?? undefined },
      })
      .then(({ error }) => {
        if (error) setError(error.message)
      })
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      signupEvents.methodTapped({ method: "password", surface })
      const res = await auth.login(email, password)
      if (!res.access_token) {
        setError(res.message ?? "Login failed.")
        return
      }
      setSessionTokens({ accessToken: res.access_token, refreshToken: res.refresh_token })
      router.push(postAuthDestination({
        next: next ?? null,
        firstSignup: false,
        hasPendingAnonCv: hasPendingAnonCvClaim(),
        hasPendingJobSave: hasPendingJobSaveClaim(),
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.")
      signupEvents.failed({ method: "password", stage: "login", error_code: "auth_failed" })
    } finally {
      setLoading(false)
    }
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

      {/* OAuth is always shown on both sub-forms — best-in-class auth surfaces
          never hide social login behind a mode toggle (user directive). */}
      {!agent && <GoogleAuthButton surface={surface} onClick={() => openOAuth("google")} />}
      <LinkedInAuthButton surface={surface} onClick={() => openOAuth("linkedin_oidc")} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0" }}>
        <div style={{ flex: 1, height: 1, background: "var(--tm-border-soft)" }} />
        <span style={{ fontSize: 12, color: "var(--tm-text-faint)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          or
        </span>
        <div style={{ flex: 1, height: 1, background: "var(--tm-border-soft)" }} />
      </div>

      {mode === "primary" && (
        <>
          <MagicLinkInput surface={surface} redirectTo={redirectTo} onSent={(e) => setPendingEmail(e)} />

          <button
            type="button"
            onClick={() => setMode("password")}
            style={{
              background: "none", border: "none", color: "var(--tm-text-faint)",
              fontSize: 13, cursor: "pointer", padding: 0, textAlign: "center", marginTop: 4,
            }}
          >
            Prefer a password?{" "}
            <span style={{ color: "var(--tm-interactive)" }}>Sign in</span>
          </button>
        </>
      )}

      {mode === "password" && (
        <form onSubmit={submitPassword} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            autoComplete="username"
            className="tm-auth-magic-input"
          />
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              required minLength={8} value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              className="tm-auth-magic-input"
              style={{ paddingRight: 64 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              style={{
                position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", color: "var(--tm-text-faint)",
                fontSize: 12, cursor: "pointer", padding: "4px 8px",
              }}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <button
            type="submit"
            className="tm-auth-provider-btn tm-auth-provider-btn--primary"
            disabled={loading}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <button
            type="button"
            onClick={() => setMode("primary")}
            style={{
              background: "none", border: "none", color: "var(--tm-text-faint)",
              fontSize: 13, cursor: "pointer", padding: 0, textAlign: "center",
            }}
          >
            <span style={{ color: "var(--tm-interactive)" }}>← Back to all sign-in options</span>
            {" "}(or email me a link)
          </button>
        </form>
      )}

      {error && (
        <p role="alert" style={{
          fontSize: 13, color: "var(--tm-danger)",
          padding: "8px 12px", borderRadius: 8,
          background: "var(--tm-danger-wash)",
          border: "1px solid rgba(251,113,133,0.25)",
        }}>{error}</p>
      )}

      <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
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

      {showSignupLink && surface === "page" && (
        <p style={{
          marginTop: 4, textAlign: "center", fontSize: 13, color: "var(--tm-text-faint)",
        }}>
          New here?{" "}
          <Link
            href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
            style={{ color: "var(--tm-interactive)", textDecoration: "none" }}
          >
            Create an account
          </Link>
        </p>
      )}
    </div>
  )
}
