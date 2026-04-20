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
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ color: "var(--tm-accent)" }}>
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

  const inputStyle = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,245,212,0.15)",
    color: "#F0F4FF", fontSize: 13, outline: "none", fontFamily: "inherit",
    transition: "border-color 0.2s",
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", position: "relative" }}>
      <ParticleBg />

      <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: 360 }}>
        {/* Logo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 32 }}>
          <div style={{ marginBottom: 12, filter: "drop-shadow(0 0 12px rgba(0,245,212,0.5))" }}>
            <TMLogo size={44} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#F0F4FF", letterSpacing: "-0.02em" }}>Truth Mirror</div>
          <div style={{ fontSize: 11, color: "rgba(240,244,255,0.4)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 4 }}>Career Intelligence</div>
        </div>

        {/* Card */}
        <div style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(0,245,212,0.15)",
          borderRadius: 16, padding: 28,
          backdropFilter: "blur(20px)",
          boxShadow: "0 0 60px rgba(0,245,212,0.05)",
        }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: "#F0F4FF", marginBottom: 4 }}>
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p style={{ fontSize: 12, color: "rgba(240,244,255,0.45)", marginBottom: 24 }}>
            {mode === "login" ? "Sign in to see your Mirror Score" : "Start with your CV — takes 60 seconds"}
          </p>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {mode === "signup" && (
              <div>
                <label style={{ fontSize: 11, color: "rgba(240,244,255,0.5)", letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                  Full name
                </label>
                <input
                  type="text" required value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                  style={inputStyle}
                  onFocus={(e) => e.target.style.borderColor = "rgba(0,245,212,0.4)"}
                  onBlur={(e) => e.target.style.borderColor = "rgba(0,245,212,0.15)"}
                />
              </div>
            )}

            <div>
              <label style={{ fontSize: 11, color: "rgba(240,244,255,0.5)", letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle}
                onFocus={(e) => e.target.style.borderColor = "rgba(0,245,212,0.4)"}
                onBlur={(e) => e.target.style.borderColor = "rgba(0,245,212,0.15)"}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, color: "rgba(240,244,255,0.5)", letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"} required minLength={8} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{ ...inputStyle, paddingRight: 40 }}
                  onFocus={(e) => e.target.style.borderColor = "rgba(0,245,212,0.4)"}
                  onBlur={(e) => e.target.style.borderColor = "rgba(0,245,212,0.15)"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer",
                    color: "rgba(240,244,255,0.35)", padding: 4, display: "flex", alignItems: "center",
                    transition: "color 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(0,245,212,0.7)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(240,244,255,0.35)")}
                >
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p style={{ fontSize: 12, color: "#A97FFF", padding: "8px 12px", borderRadius: 8, background: "rgba(123,47,255,0.1)", border: "1px solid rgba(123,47,255,0.25)" }}>
                {error}
              </p>
            )}

            {notice && (
              <p style={{ fontSize: 12, color: "#00F5D4", padding: "8px 12px", borderRadius: 8, background: "rgba(0,245,212,0.08)", border: "1px solid rgba(0,245,212,0.25)" }}>
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "11px", borderRadius: 10,
                background: loading ? "rgba(0,245,212,0.06)" : "rgba(0,245,212,0.12)",
                border: "1px solid rgba(0,245,212,0.35)",
                color: "#00F5D4", fontSize: 13, fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "inherit", transition: "all 0.2s",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Please wait…" : mode === "login" ? "Sign in →" : "Create account →"}
            </button>
          </form>
        </div>

        <p style={{ marginTop: 20, textAlign: "center", fontSize: 12, color: "rgba(240,244,255,0.35)" }}>
          {mode === "login" ? (
            <>No account?{" "}
              <Link href="/signup" style={{ color: "#00F5D4", textDecoration: "none" }}>Sign up</Link>
            </>
          ) : (
            <>Already have an account?{" "}
              <Link href="/login" style={{ color: "#00F5D4", textDecoration: "none" }}>Sign in</Link>
            </>
          )}
        </p>
      </div>
    </main>
  )
}
