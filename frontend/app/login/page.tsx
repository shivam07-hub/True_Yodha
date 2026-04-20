"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { auth, jobs } from "@/lib/api"
import type { MarketAnalytics } from "@/lib/api"
import { ParticleBg } from "@/components/particle-bg"

interface DrillEntity {
  name: string
  roles: number
  skills: string[]
  type: "company" | "industry"
}

function IntelBar({ label, count, max, active, onClick }: {
  label: string; count: number; max: number; active: boolean; onClick: () => void
}) {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px", borderRadius: 8, cursor: "pointer",
        background: active ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${active ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
        transition: "all 0.15s ease", marginBottom: 3,
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)" }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = active ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.02)" }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, fontWeight: 500, marginBottom: 4,
          color: active ? "var(--tm-accent)" : "var(--tm-text)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {label}
        </div>
        <div style={{ height: 2, borderRadius: 999, background: "var(--tm-border-soft)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "var(--tm-accent)", transition: "width 1s ease" }} />
        </div>
      </div>
      <div style={{ fontSize: 10, color: "var(--tm-text-faint)", flexShrink: 0 }}>{count.toLocaleString()}</div>
    </div>
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

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [view, setView] = useState<"companies" | "industries">("companies")
  const [selected, setSelected] = useState<DrillEntity | null>(null)
  const [skillFilter, setSkillFilter] = useState<string | null>(null)

  const { data: analytics } = useQuery({
    queryKey: ["jobs-analytics-public"],
    queryFn: () => jobs.analytics(),
    staleTime: 5 * 60 * 1000,
  })

  const { companies, industries } = buildLists(analytics)
  const baseList = view === "companies" ? companies : industries
  const list = skillFilter
    ? baseList.filter((e) => e.skills.some((s) => s.toLowerCase().includes(skillFilter.toLowerCase())))
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

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 12px", borderRadius: 7,
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,245,212,0.15)",
    color: "var(--tm-text)", fontSize: 12, outline: "none", fontFamily: "inherit",
    transition: "border-color 0.2s", boxSizing: "border-box",
  }

  return (
    <div style={{ minHeight: "100vh", position: "relative", background: "var(--tm-bg)" }}>
      <ParticleBg />

      {/* Market Intelligence — main canvas (leaves 320px gap right for login card) */}
      <div style={{
        position: "relative", zIndex: 1,
        padding: "32px 352px 48px 36px",
        minHeight: "100vh",
      }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, color: "var(--tm-accent)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6, opacity: 0.7 }}>
            Market Intelligence
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 700, color: "var(--tm-text)", letterSpacing: "-0.03em", marginBottom: 4 }}>
            Intel
          </h1>
          <p style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>
            Live hiring signals · click any entity to reveal skill data
          </p>
        </div>

        {/* Signal banner */}
        {analytics && (
          <div style={{
            padding: "14px 18px", borderRadius: 10,
            background: "var(--tm-accent-wash)",
            border: "1px solid var(--tm-border-soft)",
            marginBottom: 20, position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", fontSize: 40, color: "var(--tm-accent)", opacity: 0.06, pointerEvents: "none" }}>⚡</div>
            <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-accent)", marginBottom: 4 }}>Market Signal</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--tm-text)" }}>
              <span style={{ color: "var(--tm-accent)" }}>{analytics.total_jobs.toLocaleString()}</span> jobs across{" "}
              <span style={{ color: "var(--tm-accent)" }}>{analytics.total_companies.toLocaleString()}</span> companies in{" "}
              <span style={{ color: "var(--tm-accent)" }}>{analytics.total_industries}</span> industries
            </div>
            {analytics.latest_batch && (
              <div style={{ fontSize: 11, color: "var(--tm-text-faint)", marginTop: 3 }}>Latest batch: {analytics.latest_batch}</div>
            )}
          </div>
        )}

        {/* Top skills */}
        {topSkills.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 8 }}>
              Most demanded skills{skillFilter && <span style={{ color: "var(--tm-accent)" }}> · filtering: {skillFilter}</span>}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {topSkills.map((s) => {
                const active = skillFilter === s.skill
                return (
                  <button
                    key={s.skill}
                    onClick={() => setSkillFilter(active ? null : s.skill)}
                    style={{
                      fontSize: 10, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
                      background: active ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${active ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
                      color: active ? "var(--tm-accent)" : "var(--tm-text-muted)",
                      fontFamily: "inherit", transition: "all 0.15s ease",
                    }}
                  >
                    {s.skill}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Companies / Industries toggle */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {(["companies", "industries"] as const).map((v) => (
            <button
              key={v}
              onClick={() => { setView(v); setSelected(null); setSkillFilter(null) }}
              style={{
                padding: "6px 16px", borderRadius: 999, fontSize: 11, fontWeight: 500,
                background: view === v ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${view === v ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
                color: view === v ? "var(--tm-accent)" : "var(--tm-text-muted)",
                cursor: "pointer", textTransform: "capitalize",
                transition: "all 0.15s ease", fontFamily: "inherit",
              }}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        {/* Intel grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-accent)", opacity: 0.6, marginBottom: 10 }}>
              {view === "companies" ? "Top Companies Hiring" : "Industry Breakdown"}
            </div>
            {list.length === 0 ? (
              <div style={{ color: "var(--tm-text-faint)", fontSize: 12, padding: "24px 0", textAlign: "center" }}>Loading market data…</div>
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

          <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: 10, padding: 14 }}>
            {selected ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--tm-text)", marginBottom: 4 }}>{selected.name}</div>
                <div style={{ fontSize: 11, color: "var(--tm-accent)", marginBottom: 14 }}>{selected.roles.toLocaleString()} open roles</div>
                {selected.skills.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {selected.skills.slice(0, 10).map((s) => (
                      <div key={s} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "7px 10px", borderRadius: 7, background: "var(--tm-accent-wash)",
                      }}>
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--tm-accent)", flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: "var(--tm-text)" }}>{s}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: "var(--tm-text-faint)", fontSize: 12, padding: "16px 0" }}>No skill breakdown available.</div>
                )}
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 180, color: "var(--tm-text-faint)", fontSize: 12 }}>
                <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.3, color: "var(--tm-accent)" }}>◉</div>
                Select a {view === "companies" ? "company" : "industry"} to see skills
              </div>
            )}
          </div>
        </div>

        {/* Signup CTA */}
        <div style={{
          marginTop: 28, padding: "18px 20px", borderRadius: 10,
          background: "rgba(255,255,255,0.02)", border: "1px solid var(--tm-border-soft)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--tm-text)", marginBottom: 3 }}>
              See how your skills stack up against this market
            </div>
            <div style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>
              Upload your CV → get your Mirror Score in 60 seconds
            </div>
          </div>
          <Link href="/signup" style={{
            flexShrink: 0, padding: "8px 18px", borderRadius: 999,
            background: "var(--tm-accent-wash)", border: "1px solid var(--tm-accent-ring)",
            color: "var(--tm-accent)", fontSize: 11, fontWeight: 600,
            textDecoration: "none", whiteSpace: "nowrap",
          }}>
            Get Mirror Score →
          </Link>
        </div>
      </div>

      {/* Compact login card — fixed top right */}
      <div style={{
        position: "fixed", top: 24, right: 24, zIndex: 100,
        width: 296,
        background: "rgba(8,10,18,0.94)",
        border: "1px solid rgba(0,245,212,0.2)",
        borderRadius: 14, padding: 22,
        backdropFilter: "blur(28px)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,245,212,0.05)",
      }}>
        {/* Logo row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" style={{ color: "var(--tm-accent)", flexShrink: 0 }}>
            <path d="M12 2.5L4 6v6c0 4.8 3.6 9 8 10.5C16.4 21 20 16.8 20 12V6L12 2.5Z"
              stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M12 2.5L4 6v6c0 4.8 3.6 9 8 10.5V2.5Z" fill="currentColor" opacity="0.85" />
            <path d="M12 2.5L20 6v6c0 4.8-3.6 9-8 10.5V2.5Z" fill="currentColor" opacity="0.2" />
          </svg>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--tm-text)", letterSpacing: "-0.02em" }}>Truth Mirror</div>
            <div style={{ fontSize: 10, color: "var(--tm-text-faint)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Welcome back</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label style={{ fontSize: 10, color: "rgba(240,244,255,0.45)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>
              Email
            </label>
            <input
              type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = "rgba(0,245,212,0.4)")}
              onBlur={(e) => (e.target.style.borderColor = "rgba(0,245,212,0.15)")}
            />
          </div>

          <div>
            <label style={{ fontSize: 10, color: "rgba(240,244,255,0.45)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>
              Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"} required minLength={8} value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ ...inputStyle, paddingRight: 36 }}
                onFocus={(e) => (e.target.style.borderColor = "rgba(0,245,212,0.4)")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(0,245,212,0.15)")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                style={{
                  position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer",
                  color: "rgba(240,244,255,0.35)", padding: 3, display: "flex", alignItems: "center",
                  transition: "color 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(0,245,212,0.7)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(240,244,255,0.35)")}
              >
                {showPassword ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <p style={{
              fontSize: 11, color: "var(--tm-danger, #ff6b6b)", padding: "7px 10px", borderRadius: 7,
              background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.2)", margin: 0,
            }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 2, padding: "9px", borderRadius: 8,
              background: loading ? "rgba(0,245,212,0.06)" : "rgba(0,245,212,0.12)",
              border: "1px solid rgba(0,245,212,0.35)",
              color: "var(--tm-accent)", fontSize: 12, fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "inherit", transition: "all 0.2s", opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Signing in…" : "Sign in →"}
          </button>
        </form>

        <p style={{ marginTop: 14, textAlign: "center", fontSize: 11, color: "rgba(240,244,255,0.3)" }}>
          No account?{" "}
          <Link href="/signup" style={{ color: "var(--tm-accent)", textDecoration: "none" }}>Sign up free</Link>
        </p>
      </div>
    </div>
  )
}
