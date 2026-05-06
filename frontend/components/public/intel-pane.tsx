"use client"

import Link from "next/link"
import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { jobs } from "@/lib/api"
import type { MarketAnalytics } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useJobsRealtime } from "@/lib/hooks/use-jobs-realtime"

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

function IntelBar({ label, count, max, active, onClick }: {
  label: string; count: number; max: number; active: boolean; onClick: () => void
}) {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <button
      type="button" onClick={onClick} aria-pressed={active}
      aria-label={`${label}, ${count.toLocaleString()} roles`}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%",
        padding: "10px 14px", borderRadius: "var(--tm-radius-sm)", cursor: "pointer",
        background: active ? "var(--tm-accent-wash)" : "transparent",
        border: `1px solid ${active ? "var(--tm-accent-ring)" : "transparent"}`,
        marginBottom: 2, fontFamily: "inherit", outline: "none",
        transition: "background var(--tm-dur-fast) var(--tm-ease), border-color var(--tm-dur-fast) var(--tm-ease)",
      }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.borderColor = "var(--tm-border-soft)" } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent" } }}
      onFocus={(e) => { e.currentTarget.style.boxShadow = "0 0 0 2px var(--tm-accent-ring)" }}
      onBlur={(e) => { e.currentTarget.style.boxShadow = "none" }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: active ? 600 : 500, marginBottom: 5, textAlign: "left",
          color: active ? "var(--tm-accent)" : "var(--tm-text)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          transition: "color var(--tm-dur-fast) var(--tm-ease)",
        }}>
          {label}
        </div>
        <div style={{ height: 2, borderRadius: 999, background: "var(--tm-border-soft)", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${pct}%`, borderRadius: 999,
            background: active ? "var(--tm-accent)" : "rgba(255,255,255,0.18)",
            transition: "width 0.9s var(--tm-ease), background var(--tm-dur-fast) var(--tm-ease)",
          }} />
        </div>
      </div>
      <div style={{
        fontSize: 12, color: active ? "var(--tm-accent)" : "var(--tm-text-faint)",
        flexShrink: 0, minWidth: 36, textAlign: "right",
        fontVariantNumeric: "tabular-nums", fontWeight: 500,
        transition: "color var(--tm-dur-fast) var(--tm-ease)",
      }}>
        {count.toLocaleString()}
      </div>
      <div style={{
        fontSize: 11, opacity: active ? 1 : 0.3,
        color: active ? "var(--tm-accent)" : "var(--tm-text-faint)",
        transition: "opacity var(--tm-dur-fast) var(--tm-ease), color var(--tm-dur-fast) var(--tm-ease)",
        transform: active ? "translateX(2px)" : "none",
      }} aria-hidden="true">›</div>
    </button>
  )
}

function SkillChip({ skill }: { skill: string }) {
  const soft = issoft(skill)
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "4px 10px", borderRadius: 999, fontSize: 12,
      background: soft ? "rgba(255,255,255,0.04)" : "var(--tm-accent-wash)",
      border: `1px solid ${soft ? "var(--tm-border-soft)" : "var(--tm-accent-ring)"}`,
      color: soft ? "var(--tm-text-muted)" : "var(--tm-accent)",
    }}>
      <div style={{
        width: 4, height: 4, borderRadius: "50%", flexShrink: 0,
        background: soft ? "var(--tm-text-faint)" : "var(--tm-accent)",
      }} />
      {skill}
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

export function IntelPane() {
  const [view, setView] = useState<"companies" | "industries">("companies")
  const [selected, setSelected] = useState<DrillEntity | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [selectedRole, setSelectedRole] = useState<string>("")
  const [selectedCity, setSelectedCity] = useState<string>("")
  const [selectedCountry, setSelectedCountry] = useState<string>("")
  const [selectedMode, setSelectedMode] = useState<string>("")

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  useJobsRealtime()

  const { data: analytics } = useQuery({
    queryKey: dataKeys.jobsAnalyticsPublic(selectedRole, selectedCity, selectedCountry, selectedMode),
    queryFn: () => jobs.analytics(selectedRole || undefined, {
      locationCity: selectedCity || undefined,
      locationCountry: selectedCountry || undefined,
      locationMode: (selectedMode || undefined) as "onsite" | "hybrid" | "remote" | "unknown" | undefined,
    }),
    staleTime: 5 * 60 * 1000,
  })

  const { companies, industries } = buildLists(analytics)
  const list = view === "companies" ? companies : industries
  const max = list.reduce((m, e) => Math.max(m, e.roles), 0)
  const roleOptions = analytics?.by_role ?? []
  const cityOptions = (analytics?.by_location_city ?? [])
    .filter((item) => item.name.trim().toLowerCase() !== "unknown")
  const countryOptions = (analytics?.by_location_country ?? [])
    .filter((item) => item.name.trim().toLowerCase() !== "unknown")
  const modeOptions = (analytics?.by_location_mode ?? [])
    .filter((item) => item.name.trim().toLowerCase() !== "unknown")
  const marketSummary = analytics
    ? `${analytics.total_jobs.toLocaleString()} jobs · ${analytics.total_companies.toLocaleString()} companies · ${analytics.total_industries} industry groups${selectedRole ? ` · role: ${selectedRole}` : ""}${selectedCity ? ` · city: ${selectedCity}` : ""}${selectedCountry ? ` · country: ${selectedCountry}` : ""}${selectedMode ? ` · mode: ${selectedMode}` : ""}`
    : "Loading market coverage"

  return (
    <div className="tm-page-enter" style={{ padding: "var(--tm-page-py) var(--tm-page-px)" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, color: "var(--tm-accent)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6, opacity: 0.7 }}>
          {marketSummary}
        </div>
        <h1 style={{ fontSize: "var(--tm-fs-title)", fontWeight: 600, color: "var(--tm-text)", letterSpacing: "var(--tm-tracking-tight)", marginBottom: 4 }}>
          Intel
        </h1>
        <p style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-faint)" }}>
          Live hiring signals · tap any {view === "companies" ? "company" : "industry"} to reveal skills in demand
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>
          Role Domain
        </div>
        <select
          value={selectedRole}
          onChange={(e) => {
            setSelectedRole(e.target.value)
            setSelected(null)
          }}
          className="tm-input"
          style={{ maxWidth: 320, height: 34, fontSize: 12 }}
        >
          <option value="">All roles</option>
          {roleOptions.map((role) => (
            <option key={role.name} value={role.name}>
              {role.name} ({role.count.toLocaleString()})
            </option>
          ))}
        </select>

        <select
          value={selectedCity}
          onChange={(e) => {
            setSelectedCity(e.target.value)
            setSelected(null)
          }}
          className="tm-input"
          style={{ maxWidth: 200, height: 34, fontSize: 12 }}
        >
          <option value="">All cities</option>
          {cityOptions.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name} ({item.count.toLocaleString()})
            </option>
          ))}
        </select>

        <select
          value={selectedCountry}
          onChange={(e) => {
            setSelectedCountry(e.target.value)
            setSelected(null)
          }}
          className="tm-input"
          style={{ maxWidth: 200, height: 34, fontSize: 12 }}
        >
          <option value="">All countries</option>
          {countryOptions.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name} ({item.count.toLocaleString()})
            </option>
          ))}
        </select>

        <select
          value={selectedMode}
          onChange={(e) => {
            setSelectedMode(e.target.value)
            setSelected(null)
          }}
          className="tm-input"
          style={{ maxWidth: 180, height: 34, fontSize: 12 }}
        >
          <option value="">All modes</option>
          {modeOptions.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name} ({item.count.toLocaleString()})
            </option>
          ))}
        </select>
      </div>

      {analytics && (
        <div style={{ padding: "14px 18px", borderRadius: "var(--tm-radius)", background: "var(--tm-accent-wash)", border: "1px solid var(--tm-border-soft)", marginBottom: 24, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", fontSize: 44, color: "var(--tm-accent)", opacity: 0.06, pointerEvents: "none" }}>⚡</div>
          <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-accent)", marginBottom: 4 }}>Market Signal</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--tm-text)" }}>
            <span style={{ color: "var(--tm-accent)" }}>{analytics.total_jobs.toLocaleString()}</span> jobs across{" "}
            <span style={{ color: "var(--tm-accent)" }}>{analytics.total_companies.toLocaleString()}</span> companies in{" "}
            <span style={{ color: "var(--tm-accent)" }}>{analytics.total_industries}</span> industry groups
            {selectedRole ? <> · role: <span style={{ color: "var(--tm-accent)" }}>{selectedRole}</span></> : null}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {(["companies", "industries"] as const).map((v) => (
          <button key={v} onClick={() => { setView(v); setSelected(null) }}
            style={{
              padding: "7px 18px", borderRadius: 999, fontSize: 13, fontWeight: 500,
              background: view === v ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${view === v ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
              color: view === v ? "var(--tm-accent)" : "var(--tm-text-muted)",
              cursor: "pointer", textTransform: "capitalize",
              transition: "color var(--tm-dur) var(--tm-ease), background var(--tm-dur) var(--tm-ease), border-color var(--tm-dur) var(--tm-ease)",
              fontFamily: "inherit",
            }}
          >{v.charAt(0).toUpperCase() + v.slice(1)}</button>
        ))}
      </div>

      {!analytics ? (
        <div style={{ color: "var(--tm-text-faint)", fontSize: 14, padding: "32px 0", textAlign: "center" }}>Loading market data…</div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 16,
          alignItems: "start",
        }}>
          <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)", padding: 16 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-accent)", opacity: 0.6, marginBottom: 12 }}>
              {view === "companies" ? "Top Companies Hiring" : "Industry Breakdown"}
            </div>
            {list.map((entity) => (
              <IntelBar key={entity.name} label={entity.name} count={entity.roles} max={max}
                active={selected?.name === entity.name}
                onClick={() => setSelected(entity.name === selected?.name ? null : entity)}
              />
            ))}
          </div>

          <div style={{
            background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)",
            borderRadius: "var(--tm-radius)", padding: 20,
            minHeight: isMobile ? 160 : 280,
          }}>
            {selected ? (
              <>
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)", marginBottom: 3 }}>{selected.name}</div>
                  <div style={{ fontSize: 12, color: "var(--tm-accent)" }}>{selected.roles.toLocaleString()} open roles</div>
                </div>

                {selected.skills.length > 0 ? (() => {
                  const hard = selected.skills.filter((s) => !issoft(s))
                  const soft = selected.skills.filter((s) => issoft(s))
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      {hard.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 8 }}>Hard Skills</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {hard.slice(0, 8).map((s) => <SkillChip key={s} skill={s} />)}
                          </div>
                        </div>
                      )}
                      {hard.length > 0 && soft.length > 0 && (
                        <div style={{ height: 1, background: "var(--tm-border-soft)" }} />
                      )}
                      {soft.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 8 }}>Soft Skills</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {soft.slice(0, 6).map((s) => <SkillChip key={s} skill={s} />)}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })() : (
                  <div style={{ color: "var(--tm-text-faint)", fontSize: 13 }}>No skill data available.</div>
                )}
              </>
            ) : (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", height: "100%", minHeight: isMobile ? 120 : 220,
                color: "var(--tm-text-faint)",
              }}>
                <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.18, color: "var(--tm-accent)" }}>◎</div>
                <div style={{ fontSize: 13, color: "var(--tm-text-faint)", textAlign: "center", lineHeight: 1.6 }}>
                  Select a {view === "companies" ? "company" : "industry"}<br />
                  <span style={{ fontSize: 12, opacity: 0.6 }}>to reveal skills in demand</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ marginTop: 28, padding: "18px 20px", borderRadius: "var(--tm-radius)", background: "rgba(255,255,255,0.02)", border: "1px solid var(--tm-border-soft)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--tm-text)", marginBottom: 3 }}>See how your skills stack up against this market</div>
          <div style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>Upload your CV → get your Myro Score in 60 seconds</div>
        </div>
        <Link href="/signup" style={{ flexShrink: 0, padding: "8px 18px", borderRadius: 999, background: "var(--tm-accent-wash)", border: "1px solid var(--tm-accent-ring)", color: "var(--tm-accent)", fontSize: 12, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
          Sign up to see your Myro Score →
        </Link>
      </div>
    </div>
  )
}
