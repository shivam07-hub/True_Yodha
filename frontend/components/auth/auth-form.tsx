"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { auth } from "@/lib/api"
import { ParticleBg } from "@/components/particle-bg"

interface Props {
  mode: "login" | "signup"
}

function TMLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: "var(--tm-accent)" }}>
      <path d="M12 2.5L4 6v6c0 4.8 3.6 9 8 10.5C16.4 21 20 16.8 20 12V6L12 2.5Z"
        stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M12 2.5L4 6v6c0 4.8 3.6 9 8 10.5V2.5Z" fill="currentColor" opacity="0.85" />
      <path d="M12 2.5L20 6v6c0 4.8-3.6 9-8 10.5V2.5Z" fill="currentColor" opacity="0.2" />
      <line x1="12" y1="2.5" x2="12" y2="22" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
    </svg>
  )
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

      localStorage.setItem("mirror_token", res.access_token)
      router.push(mode === "login" ? "/market" : "/onboarding")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  const inputBase: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    background: "rgba(255,255,255,0.04)", border: "1px solid var(--tm-border)",
    color: "var(--tm-text)", fontSize: 14, outline: "none", fontFamily: "inherit",
  }

  const hasError = !!error

  return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", position: "relative" }}>
      <ParticleBg />

      <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: 360 }}>
        {/* Logo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 32 }}>
          <div style={{ marginBottom: 12, filter: "drop-shadow(0 0 12px var(--tm-accent-glow))" }}>
            <TMLogo size={44} />
          </div>
          <div style={{ fontSize: 21, fontWeight: 700, color: "var(--tm-text)", letterSpacing: "var(--tm-tracking-tight)" }}>Truth Mirror</div>
          <div style={{ fontSize: 12, color: "var(--tm-text-faint)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 4 }}>Career Intelligence</div>
        </div>

        {/* Card */}
        <div style={{
          background: "rgba(255,255,255,0.003)",
          border: "1px solid var(--tm-accent-ring)",
          borderRadius: 16, padding: 28,
          backdropFilter: "blur(20px)",
        }}>
          <h1 style={{ fontSize: 19, fontWeight: 600, color: "var(--tm-text)", marginBottom: 4 }}>
            {mode === "login" ? "Welcome back" : ""}
          </h1>
          <p style={{ fontSize: 13, color: "var(--tm-text-muted)", marginBottom: 24 }}>
            {mode === "login" ? "Sign in to see your Mirror Score" : ""}
          </p>

          {/* aria-live region catches both error and notice for screen readers */}
          <div aria-live="polite" aria-atomic="true" style={{ display: "contents" }} />

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }} noValidate>
            {mode === "signup" && (
              <div>
                <label htmlFor="auth-name" style={{ fontSize: 12, color: "var(--tm-text-muted)", letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
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
              <label htmlFor="auth-email" style={{ fontSize: 12, color: "var(--tm-text-muted)", letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
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
              <label htmlFor="auth-password" style={{ fontSize: 12, color: "var(--tm-text-muted)", letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
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
                fontSize: 14, fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Please wait…" : mode === "login" ? "Sign in →" : "Create account →"}
            </button>
          </form>
        </div>

        <p style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: "var(--tm-text-faint)" }}>
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
      </div>
    </main>
  )
}
