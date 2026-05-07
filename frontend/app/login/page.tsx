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
import { IntelPane } from "@/components/public/intel-pane"

export default function LoginPage() {
  const router = useRouter()

  // Login form state
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await auth.login(email, password)
      if (!res.access_token) {
        setError(res.message ?? "Login failed")
        return
      }
      setSessionTokens({ accessToken: res.access_token, refreshToken: res.refresh_token })
      router.push("/home")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleSignIn() {
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 7,
    background: "var(--tm-hover)", border: "1px solid var(--tm-border)",
    color: "var(--tm-text)", fontSize: 13, outline: "none", fontFamily: "inherit",
    boxSizing: "border-box",
  }

  return (
    <div style={{ display: "flex", height: "100dvh", width: "100dvw", overflow: "hidden", background: "var(--tm-bg)", position: "relative" }}>
      <ParticleBg />

      {/* ── Login sidebar — mirrors AppShell Sidebar exactly ── */}
      <nav
        style={{
          width: 220,
          height: "100dvh",
          flexShrink: 0,
          background: "var(--tm-surface)",
          borderRight: "1px solid var(--tm-border-soft)",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          zIndex: 20,
          overflow: "hidden",
        }}
      >
        {/* Logo row — pixel-identical to AppShell */}
        <div style={{
          padding: "22px 16px 20px",
          display: "flex", alignItems: "center", gap: 12,
          borderBottom: "1px solid var(--tm-border-soft)",
          minHeight: 76,
        }}>
          <div style={{ minWidth: 32, display: "flex", alignItems: "center", justifyContent: "center", filter: "drop-shadow(0 0 8px var(--tm-accent-glow))" }}>
            <MyroLogo size={32} />
          </div>
          <div style={{ whiteSpace: "nowrap", overflow: "hidden" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tm-text)", letterSpacing: "var(--tm-tracking-tight)" }}>Myro</div>
            <div style={{ fontSize: 10, color: "var(--tm-text-faint)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 2 }}>Career Intelligence</div>
          </div>
        </div>

        {/* Login form */}
        <div style={{
          flex: 1, padding: "16px 12px",
          overflow: "hidden",
          display: "flex", flexDirection: "column", gap: 14,
        }}>
          {/* Welcome heading */}
          <div style={{ whiteSpace: "nowrap" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tm-text)" }}>Welcome back</div>
            <div style={{ fontSize: 11, color: "var(--tm-text-faint)", marginTop: 2 }}>Sign in to continue</div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Email */}
            <div>
              <label style={{ fontSize: 11, color: "var(--tm-text-faint)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>
                Email
              </label>
              <input
                type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = "var(--tm-accent-ring)" }}
                onBlur={(e) => { e.target.style.borderColor = "var(--tm-border)" }}
              />
            </div>

            {/* Password */}
            <div>
              <label style={{ fontSize: 11, color: "var(--tm-text-faint)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"} required minLength={8} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{ ...inputStyle, paddingRight: 34 }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--tm-accent-ring)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--tm-border)")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--tm-text-faint)", padding: 2, display: "flex", alignItems: "center",
                    transition: "color 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--tm-accent)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--tm-text-faint)")}
                >
                  {showPassword ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p style={{
                fontSize: 12, color: "var(--tm-danger, #ff6b6b)", padding: "6px 9px", borderRadius: 6,
                background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.2)", margin: 0,
                whiteSpace: "normal", lineHeight: 1.4,
              }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "9px", borderRadius: 8,
                background: loading ? "var(--tm-accent-wash)" : "var(--tm-accent-wash)",
                border: "1px solid var(--tm-accent-ring)",
                color: "var(--tm-accent)", fontSize: 13, fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "inherit", transition: "all 0.2s", opacity: loading ? 0.6 : 1,
                whiteSpace: "nowrap",
              }}
            >
              {loading ? "Signing in…" : "Sign in →"}
            </button>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0" }}>
              <div style={{ flex: 1, height: 1, background: "var(--tm-border-soft)" }} />
              <span style={{ fontSize: 10, color: "var(--tm-text-faint)" }}>or</span>
              <div style={{ flex: 1, height: 1, background: "var(--tm-border-soft)" }} />
            </div>

            {/* Google */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              style={{
                padding: "8px 10px", borderRadius: 8, width: "100%",
                background: "var(--tm-hover)",
                border: "1px solid var(--tm-border)",
                color: "var(--tm-text)", fontSize: 12, fontWeight: 500,
                cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "inherit", opacity: loading ? 0.6 : 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                transition: "border-color 0.2s, background 0.2s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--tm-accent-ring)"
                e.currentTarget.style.background = "var(--tm-accent-wash)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--tm-border)"
                e.currentTarget.style.background = "var(--tm-hover)"
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
          </form>
        </div>

        <div style={{ padding: "10px 12px 12px", borderTop: "1px solid var(--tm-border-soft)", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 10, color: "var(--tm-text-faint)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Background</div>
          <SurfaceToggle />
        </div>

        {/* Bottom — mirrors UserFooter avatar row */}
        <div style={{ borderTop: "1px solid var(--tm-border-soft)" }}>
          <div style={{ padding: "10px 8px", display: "flex", alignItems: "center", gap: 10 }}>
            {/* Avatar-style circle */}
            <div style={{
              width: 32, height: 32, minWidth: 32, borderRadius: "50%",
              background: "linear-gradient(135deg, var(--tm-border), var(--tm-accent-wash))",
              border: "1px solid var(--tm-border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, color: "var(--tm-text-faint)",
            }}>
              ?
            </div>
            <div style={{ whiteSpace: "nowrap", overflow: "hidden" }}>
              <div style={{ fontSize: 12, color: "var(--tm-text-muted)" }}>No account?</div>
              <Link href="/signup" style={{ fontSize: 11, color: "var(--tm-accent)", textDecoration: "none" }}>
                Sign up free →
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Market Intelligence ── */}
      <main style={{ flex: 1, overflowY: "auto", overflowX: "hidden", position: "relative", zIndex: 2, display: "flex", flexDirection: "column" }}>
        <PublicTopNav active="intel" />
        <IntelPane />
        <PublicFooter />
      </main>
    </div>
  )
}
