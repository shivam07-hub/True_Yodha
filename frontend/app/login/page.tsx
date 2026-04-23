"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { auth, jobs } from "@/lib/api"
import type { MarketAnalytics } from "@/lib/api"
import { ParticleBg } from "@/components/particle-bg"
import { AccentToggle } from "@/components/accent-toggle"
import { SurfaceToggle } from "@/components/surface-toggle"
import { createClient } from "@/lib/supabase"

const SOFT_SKILLS = new Set([
  "communication", "leadership", "teamwork", "collaboration", "problem solving",
  "time management", "critical thinking", "adaptability", "creativity", "attention to detail",
  "project management", "analytical thinking", "customer service", "presentation",
  "negotiation", "writing", "organization", "decision making", "interpersonal skills",
  "stakeholder management", "strategic planning", "mentoring", "coaching",
  "conflict resolution", "public speaking", "emotional intelligence", "research",
  "planning", "multitasking", "work ethic", "accountability", "flexibility",
  "active listening", "self-motivation", "initiative",
])

function issoft(skill: string) {
  return SOFT_SKILLS.has(skill.toLowerCase())
}

interface DrillEntity {
  name: string
  roles: number
  skills: string[]
  type: "company" | "industry"
}

function TMLogo({ size = 28 }: { size?: number }) {
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

function IntelBar({ label, count, max, active, onClick }: {
  label: string; count: number; max: number; active: boolean; onClick: () => void
}) {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${label}, ${count.toLocaleString()} roles`}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%",
        padding: "10px 14px", borderRadius: "var(--tm-radius-sm)", cursor: "pointer",
        background: active ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${active ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
        marginBottom: 4, fontFamily: "inherit",
        outline: "none",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--tm-hover)" }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.02)" }}
      onFocus={(e) => { e.currentTarget.style.boxShadow = "0 0 0 2px var(--tm-accent-ring)" }}
      onBlur={(e) => { e.currentTarget.style.boxShadow = "none" }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 500, marginBottom: 5,
          color: active ? "var(--tm-accent)" : "var(--tm-text)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          textAlign: "left",
        }}>
          {label}
        </div>
        <div style={{ height: 3, borderRadius: 999, background: "var(--tm-border-soft)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: "var(--tm-accent)", transition: "width 1s var(--tm-ease)" }} />
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--tm-text-faint)", flexShrink: 0, minWidth: 40, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {count.toLocaleString()}
      </div>
      <div style={{ fontSize: 12, color: active ? "var(--tm-accent)" : "var(--tm-text-faint)" }} aria-hidden="true">›</div>
    </button>
  )
}

function buildLists(analytics: MarketAnalytics | undefined) {
  const companies: DrillEntity[] = (analytics?.by_company ?? []).slice(0, 12).map((c) => ({
    name: c.name, roles: c.count,
    skills: analytics?.company_skills?.[c.name] ?? [],
    type: "company" as const,
  }))
  const industries: DrillEntity[] = (analytics?.by_industry ?? []).slice(0, 12).map((ind) => ({
    name: ind.name, roles: ind.count,
    skills: analytics?.industry_skills?.[ind.name] ?? [],
    type: "industry" as const,
  }))
  return { companies, industries }
}

export default function LoginPage() {
  const router = useRouter()

  // Login form state
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Market intel state
  const [view, setView] = useState<"companies" | "industries">("companies")
  const [selected, setSelected] = useState<DrillEntity | null>(null)
  const [skillFilters, setSkillFilters] = useState<Set<string>>(new Set())

  const { data: analytics } = useQuery({
    queryKey: ["jobs-analytics-public"],
    queryFn: () => jobs.analytics(),
    staleTime: 5 * 60 * 1000,
  })

  const { companies, industries } = buildLists(analytics)
  const baseList = view === "companies" ? companies : industries
  const list = skillFilters.size > 0
    ? baseList.filter((e) =>
        Array.from(skillFilters).every((f) =>
          e.skills.some((s) => s.toLowerCase().includes(f.toLowerCase()))
        )
      )
    : baseList
  const max = baseList.reduce((m, e) => Math.max(m, e.roles), 0)
  const topSkills = analytics?.top_skills?.slice(0, 14) ?? []

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
      localStorage.setItem("mirror_token", res.access_token)
      router.push("/market")
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
            <TMLogo />
          </div>
          <div style={{ whiteSpace: "nowrap", overflow: "hidden" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tm-text)", letterSpacing: "var(--tm-tracking-tight)" }}>Truth Mirror</div>
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
          <div style={{ fontSize: 10, color: "var(--tm-text-faint)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Accent</div>
          <AccentToggle />
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

      {/* ── Market Intelligence — same as /market page, no AppShell wrapper ── */}
      <main style={{ flex: 1, overflowY: "auto", overflowX: "hidden", position: "relative", zIndex: 2 }}>
        <div className="tm-page-enter" style={{ padding: "var(--tm-page-py) var(--tm-page-px)" }}>

          {/* Header */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, color: "var(--tm-accent)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6, opacity: 0.7 }}>
              app/intel
            </div>
            <h1 style={{ fontSize: "var(--tm-fs-title)", fontWeight: 600, color: "var(--tm-text)", letterSpacing: "var(--tm-tracking-tight)", marginBottom: 4 }}>
              Intel
            </h1>
            <p style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-faint)" }}>
              Live hiring signals · click any entity to reveal skill data
            </p>
          </div>

          {/* Signal banner */}
          {analytics && (
            <div style={{
              padding: "16px 20px", borderRadius: "var(--tm-radius)",
              background: "var(--tm-accent-wash)", border: "1px solid var(--tm-border-soft)",
              marginBottom: 24, position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", right: 20, top: "50%", transform: "translateY(-50%)", fontSize: 49, color: "var(--tm-accent)", opacity: 0.06, pointerEvents: "none" }}>⚡</div>
              <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-accent)", marginBottom: 6 }}>Market Signal</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--tm-text)", marginBottom: 4 }}>
                <span style={{ color: "var(--tm-accent)" }}>{analytics.total_jobs.toLocaleString()}</span> jobs across{" "}
                <span style={{ color: "var(--tm-accent)" }}>{analytics.total_companies.toLocaleString()}</span> companies in{" "}
                <span style={{ color: "var(--tm-accent)" }}>{analytics.total_industries}</span> industries
              </div>
              {analytics.latest_batch && (
                <div style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>Latest batch: {analytics.latest_batch}</div>
              )}
            </div>
          )}

          {/* Top skills — split hard / soft */}
          {topSkills.length > 0 && (() => {
            const hard = topSkills.filter((s) => !issoft(s.skill))
            const soft = topSkills.filter((s) => issoft(s.skill))
            function toggleSkill(skill: string) {
              setSkillFilters((prev) => {
                const next = new Set(prev)
                if (next.has(skill)) { next.delete(skill) } else { next.add(skill) }
                return next
              })
              setSelected(null)
            }
            const pillStyle = (active: boolean): React.CSSProperties => ({
              fontSize: 12, padding: "5px 12px", borderRadius: 999, cursor: "pointer",
              background: active ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${active ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
              color: active ? "var(--tm-accent)" : "var(--tm-text-muted)",
              fontFamily: "inherit", transition: "all var(--tm-dur-fast) var(--tm-ease)",
              boxShadow: active ? "var(--tm-shadow-glow)" : "none",
            })
            const SkillGroup = ({ label, items }: { label: string; items: typeof topSkills }) => (
              items.length === 0 ? null : (
                <div>
                  <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 8 }}>{label}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {items.map((s) => {
                      const active = skillFilters.has(s.skill)
                      return (
                        <button key={s.skill} onClick={() => toggleSkill(s.skill)} style={pillStyle(active)} aria-pressed={active}>
                          {s.skill}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            )
            return (
              <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>
                    {skillFilters.size > 0 && (
                      <><span style={{ color: "var(--tm-accent)", fontWeight: 600 }}>{skillFilters.size}</span> skill{skillFilters.size > 1 ? "s" : ""} selected — showing intersection</>
                    )}
                  </div>
                  {skillFilters.size > 0 && (
                    <button
                      onClick={() => { setSkillFilters(new Set()); setSelected(null) }}
                      style={{
                        fontSize: 11, color: "var(--tm-text-faint)", background: "none",
                        border: "none", cursor: "pointer", fontFamily: "inherit", padding: "2px 6px",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--tm-danger)" }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--tm-text-faint)" }}
                    >
                      Clear ×
                    </button>
                  )}
                </div>
                <SkillGroup label="Hard Skills" items={hard} />
                {hard.length > 0 && soft.length > 0 && (
                  <div style={{ height: 1, background: "var(--tm-border-soft)" }} />
                )}
                <SkillGroup label="Soft Skills" items={soft} />
              </div>
            )
          })()}

          {/* Toggle */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {(["companies", "industries"] as const).map((v) => (
              <button
                key={v}
                onClick={() => { setView(v); setSelected(null); setSkillFilters(new Set()) }}
                style={{
                  padding: "7px 18px", borderRadius: 999, fontSize: 13, fontWeight: 500,
                  background: view === v ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${view === v ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
                  color: view === v ? "var(--tm-accent)" : "var(--tm-text-muted)",
                  cursor: "pointer", textTransform: "capitalize",
                  transition: "all var(--tm-dur) var(--tm-ease)", fontFamily: "inherit",
                }}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          {/* Intel grid */}
          {!analytics ? (
            <div style={{ color: "var(--tm-text-faint)", fontSize: 14, padding: "32px 0", textAlign: "center" }}>Loading market data…</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)", padding: 16 }}>
                <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-accent)", opacity: 0.6, marginBottom: 12 }}>
                  {view === "companies" ? "Top Companies Hiring" : "Industry Breakdown"}
                </div>
                {list.length === 0 ? (
                  <div style={{ color: "var(--tm-text-faint)", fontSize: 14, padding: "32px 0", textAlign: "center" }}>
                    {skillFilters.size > 0 ? "No companies hire for all selected skills" : "No data yet"}
                  </div>
                ) : (
                  list.map((entity) => (
                    <IntelBar
                      key={entity.name}
                      label={entity.name}
                      count={entity.roles}
                      max={max}
                      active={selected?.name === entity.name}
                      onClick={() => setSelected(entity.name === selected?.name ? null : entity)}
                    />
                  ))
                )}
              </div>

              <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)", padding: 16 }}>
                {selected ? (
                  <>
                    <div style={{ fontSize: 17, fontWeight: 600, color: "var(--tm-text)", marginBottom: 4 }}>{selected.name}</div>
                    <div style={{ fontSize: 12, color: "var(--tm-accent)", marginBottom: 16 }}>{selected.roles.toLocaleString()} open roles</div>
                    {selected.skills.length > 0 ? (
                      <>
                        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 10 }}>Skills in demand</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {selected.skills.slice(0, 10).map((s) => (
                            <div key={s} style={{
                              display: "flex", alignItems: "center", gap: 10,
                              padding: "8px 12px", borderRadius: "var(--tm-radius-sm)",
                              background: "var(--tm-accent-wash)",
                            }}>
                              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--tm-accent)", boxShadow: "0 0 6px var(--tm-accent-glow)", flexShrink: 0 }} />
                              <span style={{ flex: 1, fontSize: 13, color: "var(--tm-text)" }}>{s}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div style={{ color: "var(--tm-text-faint)", fontSize: 13, padding: "16px 0" }}>No skill breakdown available.</div>
                    )}
                  </>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, color: "var(--tm-text-faint)", fontSize: 14 }}>
                    <div style={{ fontSize: 33, marginBottom: 12, opacity: 0.3, color: "var(--tm-accent)" }}>◉</div>
                    Select a {view === "companies" ? "company" : "industry"} to see skills
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Signup CTA */}
          <div style={{
            marginTop: 28, padding: "18px 20px", borderRadius: "var(--tm-radius)",
            background: "rgba(255,255,255,0.02)", border: "1px solid var(--tm-border-soft)",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--tm-text)", marginBottom: 3 }}>
                See how your skills stack up against this market
              </div>
              <div style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>
                Upload your CV → get your Mirror Score in 60 seconds
              </div>
            </div>
            <Link href="/signup" style={{
              flexShrink: 0, padding: "8px 18px", borderRadius: 999,
              background: "var(--tm-accent-wash)", border: "1px solid var(--tm-accent-ring)",
              color: "var(--tm-accent)", fontSize: 12, fontWeight: 600,
              textDecoration: "none", whiteSpace: "nowrap",
            }}>
              Sign up now to see Mirror Scores →
            </Link>
          </div>

        </div>
      </main>
    </div>
  )
}
