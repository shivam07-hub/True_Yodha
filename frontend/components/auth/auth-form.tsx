"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { auth } from "@/lib/api"
import { ParticleBg } from "@/components/particle-bg"
import { SurfaceToggle } from "@/components/surface-toggle"
import { createClient } from "@/lib/supabase"
import { MyroLogo } from "@/components/myro-logo"
import { setSessionTokens } from "@/lib/session"
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"

interface Props {
  mode: "login" | "signup"
}

export function AuthForm({ mode }: Props) {
  const router = useRouter()
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleGoogleSignIn() {
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    }
    // On success: browser redirects to Google — no further action here
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setLoading(true)
    try {
      const res = mode === "login"
        ? await auth.login(email, password)
        : await auth.signup(email, password, fullName)

      if (!res.access_token || res.requires_email_confirmation) {
        setNotice(res.message ?? "Check your email for a confirmation link, then sign in.")
        return
      }

      setSessionTokens({ accessToken: res.access_token, refreshToken: res.refresh_token })
      router.push(mode === "login" ? "/home" : "/onboarding")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  const inputBase: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    background: "rgba(255,255,255,0.04)", border: "1px solid var(--tm-border)",
    color: "var(--tm-text)", fontSize: 15, outline: "none", fontFamily: "inherit",
  }

  const hasError = !!error

  return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", position: "relative" }}>
      <ParticleBg />
      <PublicTopNav active={mode === "signup" ? "signup" : "login"} />

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", position: "relative", zIndex: 2 }}>
      <div style={{ width: "100%", maxWidth: 360 }}>
        {/* Logo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 32 }}>
          <div style={{ marginBottom: 12, filter: "drop-shadow(0 0 12px var(--tm-accent-glow))" }}>
            <MyroLogo size={44} />
          </div>
          <div style={{ fontFamily: "var(--tm-font-display)", fontSize: 32, lineHeight: 1, fontWeight: 600, color: "var(--tm-text)", letterSpacing: 0 }}>Myro</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tm-text-faint)", letterSpacing: 0, textTransform: "uppercase", marginTop: 6 }}>Career Intelligence</div>
        </div>

        {/* Card */}
        <div style={{
          background: "rgba(255,255,255,0.003)",
          border: "1px solid var(--tm-accent-ring)",
          borderRadius: 16, padding: 28,
          backdropFilter: "blur(20px)",
        }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--tm-text)", marginBottom: 4 }}>
            {mode === "login" ? "Welcome back" : ""}
          </h1>
          <p style={{ fontSize: 15, color: "var(--tm-text-muted)", marginBottom: 24 }}>
            {mode === "login" ? "Sign in to see your Myro Score" : ""}
          </p>

          {/* aria-live region catches both error and notice for screen readers */}
          <div aria-live="polite" aria-atomic="true" style={{ display: "contents" }} />

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }} noValidate>
            {mode === "signup" && (
              <div>
                <label htmlFor="auth-name" style={{ fontSize: 13, fontWeight: 700, color: "var(--tm-text-muted)", letterSpacing: 0, textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                  Secret Ninja User_Code
                </label>
                <input
                  id="auth-name"
                  type="text" required value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  style={inputBase}
                  onFocus={(e) => { e.target.style.borderColor = "var(--tm-accent-ring)" }}
                  onBlur={(e) => { e.target.style.borderColor = "var(--tm-border)" }}
                />
              </div>
            )}

            <div>
              <label htmlFor="auth-email" style={{ fontSize: 13, fontWeight: 700, color: "var(--tm-text-muted)", letterSpacing: 0, textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                Email
              </label>
              <input
                id="auth-email"
                type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder=""
                autoComplete={mode === "login" ? "username" : "email"}
                aria-describedby={hasError ? "auth-error" : undefined}
                aria-invalid={hasError || undefined}
                style={inputBase}
                onFocus={(e) => { e.target.style.borderColor = "var(--tm-accent-ring)" }}
                onBlur={(e) => { e.target.style.borderColor = hasError ? "var(--tm-danger)" : "var(--tm-border)" }}
              />
            </div>

            <div>
              <label htmlFor="auth-password" style={{ fontSize: 13, fontWeight: 700, color: "var(--tm-text-muted)", letterSpacing: 0, textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="auth-password"
                  type={showPassword ? "text" : "password"} required minLength={8} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder=""
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  style={{ ...inputBase, paddingRight: 40 }}
                  onFocus={(e) => { e.target.style.borderColor = "var(--tm-accent-ring)" }}
                  onBlur={(e) => { e.target.style.borderColor = "var(--tm-border)" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  style={{
                    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--tm-text-faint)", padding: 4, display: "flex", alignItems: "center",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--tm-accent)" }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--tm-text-faint)" }}
                >
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p id="auth-error" role="alert" style={{
                fontSize: 13, color: "var(--tm-danger)",
                padding: "8px 12px", borderRadius: 8,
                background: "var(--tm-danger-wash)",
                border: "1px solid rgba(251,113,133,0.25)",
              }}>
                {error}
              </p>
            )}

            {notice && (
              <p role="status" style={{
                fontSize: 13, color: "var(--tm-accent)",
                padding: "8px 12px", borderRadius: 8,
                background: "var(--tm-accent-wash)",
                border: "1px solid var(--tm-accent-ring)",
              }}>
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              style={{
                padding: "11px", borderRadius: 10,
                background: loading ? "var(--tm-accent-wash)" : "var(--tm-accent)",
                border: `1px solid ${loading ? "var(--tm-border)" : "var(--tm-accent)"}`,
                color: loading ? "var(--tm-text-muted)" : "var(--tm-accent-fg)",
                fontSize: 15, fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Please wait…" : mode === "login" ? "Sign in →" : "Create account →"}
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
              <div style={{ flex: 1, height: 1, background: "var(--tm-border-soft)" }} />
              <span style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>or</span>
              <div style={{ flex: 1, height: 1, background: "var(--tm-border-soft)" }} />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              style={{
                padding: "11px", borderRadius: 10,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--tm-border)",
                color: "var(--tm-text)",
                fontSize: 15, fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                opacity: loading ? 0.6 : 1,
                transition: "border-color var(--tm-dur) var(--tm-ease)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--tm-accent-ring)" }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--tm-border)" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
          </form>
        </div>

        <p style={{ marginTop: 20, textAlign: "center", fontSize: 14, color: "var(--tm-text-faint)" }}>
          {mode === "login" ? (
            <>No account?{" "}
              <Link href="/signup" style={{ color: "var(--tm-accent)", textDecoration: "none" }}>Sign up</Link>
            </>
          ) : (
            <>Already have an account?{" "}
              <Link href="/login" style={{ color: "var(--tm-accent)", textDecoration: "none" }}>Sign in</Link>
            </>
          )}
        </p>

        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--tm-text-faint)", letterSpacing: 0, textTransform: "uppercase" }}>Background</div>
          <SurfaceToggle />
        </div>
      </div>
      </div>
      <PublicFooter />
    </main>
  )
}
