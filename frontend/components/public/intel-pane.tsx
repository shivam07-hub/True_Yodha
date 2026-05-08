"use client"

import Link from "next/link"
import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { jobs } from "@/lib/api"
import type { MarketAnalytics, SkillCountItem } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { dataKeys } from "@/lib/domain-data"
import { MARKET_LOADING_STEPS } from "@/lib/market-loading-copy"
import { useRotatingMessage } from "@/lib/hooks/use-rotating-message"
import { useJobsRealtime } from "@/lib/hooks/use-jobs-realtime"
import { IntelLoadingState } from "@/components/market/intel-loading-state"
import { cacheKey, withLocalCache } from "@/lib/local-cache"

const ANALYTICS_TTL = 7 * 24 * 60 * 60 * 1000

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
  skills: SkillCountItem[]
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
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = "var(--tm-hover)"; e.currentTarget.style.borderColor = "var(--tm-border-soft)" } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent" } }}
      onFocus={(e) => { e.currentTarget.style.boxShadow = "0 0 0 2px var(--tm-accent-ring)" }}
      onBlur={(e) => { e.currentTarget.style.boxShadow = "none" }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: active ? 700 : 600, marginBottom: 5, textAlign: "left",
          color: active ? "var(--tm-accent)" : "var(--tm-text)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          transition: "color var(--tm-dur-fast) var(--tm-ease)",
        }}>
          {label}
        </div>
        <div style={{ height: 2, borderRadius: 999, background: "var(--tm-border-soft)", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${pct}%`, borderRadius: 999,
            background: active ? "var(--tm-accent)" : "var(--tm-border)",
            transition: "width 0.9s var(--tm-ease), background var(--tm-dur-fast) var(--tm-ease)",
          }} />
        </div>
      </div>
      <div style={{
        fontSize: 13, color: active ? "var(--tm-accent)" : "var(--tm-text-faint)",
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

function SkillChip({ skill, count }: { skill: string; count: number }) {
  const soft = issoft(skill)
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      padding: "5px 11px", borderRadius: 999, fontSize: 13,
      background: soft ? "var(--tm-hover)" : "var(--tm-accent-wash)",
      border: `1px solid ${soft ? "var(--tm-border-soft)" : "var(--tm-accent-ring)"}`,
      color: soft ? "var(--tm-text-muted)" : "var(--tm-accent)",
    }}>
      <div style={{
        width: 4, height: 4, borderRadius: "50%", flexShrink: 0,
        background: soft ? "var(--tm-text-faint)" : "var(--tm-accent)",
      }} />
      {skill}
      <span style={{ color: "var(--tm-text-faint)", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
        {count.toLocaleString()}
      </span>
    </div>
  )
}

function buildLists(analytics: MarketAnalytics | undefined) {
  const companies: DrillEntity[] = (analytics?.by_company ?? []).map((c) => ({
    name: c.name, roles: c.count, skills: [], type: "company" as const,
  }))
  const industries: DrillEntity[] = (analytics?.by_industry ?? []).map((ind) => ({
    name: ind.name, roles: ind.count, skills: [], type: "industry" as const,
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
    queryFn: () => withLocalCache(
      cacheKey(["analytics_public", selectedRole, selectedCity, selectedCountry, selectedMode]),
      ANALYTICS_TTL,
      () => jobs.analytics(selectedRole || undefined, {
        locationCity: selectedCity || undefined,
        locationCountry: selectedCountry || undefined,
        locationMode: (selectedMode || undefined) as "onsite" | "hybrid" | "remote" | "unknown" | undefined,
      }),
    ),
    staleTime: ANALYTICS_TTL,
  })

  const { data: entitySkillsData, isLoading: skillsLoading } = useQuery({
    queryKey: dataKeys.entitySkills(selected?.name, selected?.type, selectedCity, selectedCountry, selectedMode),
    queryFn: () => jobs.analyticsEntitySkills(
      selected!.name,
      selected!.type as "company" | "industry",
      { locationCity: selectedCity || undefined, locationCountry: selectedCountry || undefined, locationMode: (selectedMode || undefined) as "onsite" | "hybrid" | "remote" | "unknown" | undefined },
    ),
    enabled: !!selected,
    staleTime: 60 * 60 * 1000,
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
  const loadingMessage = useRotatingMessage(MARKET_LOADING_STEPS, { enabled: !analytics })

  return (
    <div className="tm-page-enter" style={{ padding: "var(--tm-page-py) var(--tm-page-px)" }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontFamily: "var(--tm-font-display)", fontSize: "var(--tm-fs-display)", lineHeight: "var(--tm-lh-display)", fontWeight: 600, color: "var(--tm-text)", letterSpacing: 0, marginBottom: 6 }}>
          Live Career Intel
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.55, color: "var(--tm-text-muted)", maxWidth: 720 }}>
          Live hiring signals · tap any {view === "companies" ? "company" : "industry"} to reveal skills in demand
        </p>
      </div>

      {analytics && (
        <div style={{ padding: "14px 18px", borderRadius: "var(--tm-radius)", background: "var(--tm-accent-wash)", border: "1px solid var(--tm-border-soft)", marginBottom: 24, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", fontSize: 44, color: "var(--tm-accent)", opacity: 0.06, pointerEvents: "none" }}>⚡</div>
          <div style={{ fontSize: 13, letterSpacing: 0, textTransform: "uppercase", color: "var(--tm-accent)", marginBottom: 4, fontWeight: 700 }}>Market Signal</div>
          <div style={{ fontSize: 16, lineHeight: 1.45, fontWeight: 600, color: "var(--tm-text)" }}>
            <span style={{ color: "var(--tm-accent)" }}>{analytics.total_jobs.toLocaleString()}</span> jobs across{" "}
            <span style={{ color: "var(--tm-accent)" }}>{analytics.total_companies.toLocaleString()}</span> companies in{" "}
            <span style={{ color: "var(--tm-accent)" }}>{analytics.total_industries}</span> industry groups
            {selectedRole ? <> · role: <span style={{ color: "var(--tm-accent)" }}>{selectedRole}</span></> : null}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, letterSpacing: 0, textTransform: "uppercase", color: "var(--tm-text-faint)", fontWeight: 700 }}>
          Role Domain
        </div>
        <select
          value={selectedRole}
          onChange={(e) => {
            setSelectedRole(e.target.value)
            setSelected(null)
          }}
          className="tm-input"
          style={{ maxWidth: 320, height: 40, fontSize: 14 }}
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
          style={{ maxWidth: 200, height: 40, fontSize: 14 }}
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
          style={{ maxWidth: 200, height: 40, fontSize: 14 }}
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
          style={{ maxWidth: 180, height: 40, fontSize: 14 }}
        >
          <option value="">All modes</option>
          {modeOptions.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name} ({item.count.toLocaleString()})
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {(["companies", "industries"] as const).map((v) => (
          <button key={v} onClick={() => { setView(v); setSelected(null) }}
            style={{
              padding: "9px 20px", borderRadius: 999, fontSize: 15, fontWeight: 600,
              background: view === v ? "var(--tm-accent-wash)" : "var(--tm-hover-soft)",
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
        <IntelLoadingState message={loadingMessage} />
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 16,
          alignItems: "start",
        }}>
          <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius)", padding: 16 }}>
            <div style={{ fontSize: 13, letterSpacing: 0, textTransform: "uppercase", color: "var(--tm-accent)", opacity: 0.78, marginBottom: 12, fontWeight: 700 }}>
              {view === "companies" ? "Top Companies Hiring" : "Industry Breakdown"}
            </div>
            <div style={{ fontSize: 13, color: "var(--tm-text-faint)", marginBottom: 10 }}>
              {view === "companies"
                ? `Showing ${list.length.toLocaleString()} scraped companies`
                : `Showing ${list.length.toLocaleString()} industry groups`}{" "}
              · scroll to view all
            </div>
            <div
              role="region"
              aria-label={view === "companies" ? "Scraped companies list" : "Industry breakdown list"}
              style={{
                maxHeight: isMobile ? "min(52dvh, 420px)" : "min(64dvh, 700px)",
                overflowY: "auto",
                direction: "rtl",
                scrollbarWidth: "thin",
                scrollbarGutter: "stable both-edges",
              }}
            >
              <div style={{ direction: "ltr" }}>
                {list.map((entity) => (
                  <IntelBar key={entity.name} label={entity.name} count={entity.roles} max={max}
                    active={selected?.name === entity.name}
                    onClick={() => setSelected(entity.name === selected?.name ? null : entity)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div style={{
            background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)",
            borderRadius: "var(--tm-radius)", padding: 20,
            minHeight: isMobile ? 160 : 280,
          }}>
            {selected ? (
              <>
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "var(--tm-text)", marginBottom: 3 }}>{selected.name}</div>
                  <div style={{ fontSize: 14, color: "var(--tm-accent)", fontWeight: 600 }}>{selected.roles.toLocaleString()} open roles</div>
                </div>

                {skillsLoading ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="animate-pulse" style={{ height: 28, width: `${70 + (i % 3) * 30}px`, borderRadius: 999 }} />
                    ))}
                  </div>
                ) : (() => {
                  const skills = entitySkillsData?.skills ?? []
                  const hard = skills.filter((s) => !issoft(s.skill))
                  const soft = skills.filter((s) => issoft(s.skill))
                  if (skills.length === 0) return <div style={{ color: "var(--tm-text-faint)", fontSize: 14 }}>No skill data available.</div>
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      {hard.length > 0 && (
                        <div>
                          <div style={{ fontSize: 13, letterSpacing: 0, textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 8, fontWeight: 700 }}>Hard Skills · job mentions</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {hard.slice(0, 12).map((s) => <SkillChip key={s.skill} skill={s.skill} count={s.count} />)}
                          </div>
                        </div>
                      )}
                      {hard.length > 0 && soft.length > 0 && (
                        <div style={{ height: 1, background: "var(--tm-border-soft)" }} />
                      )}
                      {soft.length > 0 && (
                        <div>
                          <div style={{ fontSize: 13, letterSpacing: 0, textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 8, fontWeight: 700 }}>Soft Skills · job mentions</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {soft.slice(0, 8).map((s) => <SkillChip key={s.skill} skill={s.skill} count={s.count} />)}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </>
            ) : (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", height: "100%", minHeight: isMobile ? 120 : 220,
                color: "var(--tm-text-faint)",
              }}>
                <div style={{ fontSize: 34, marginBottom: 12, opacity: 0.18, color: "var(--tm-accent)" }}>◎</div>
                <div style={{ fontSize: 15, color: "var(--tm-text-faint)", textAlign: "center", lineHeight: 1.6 }}>
                  Select a {view === "companies" ? "company" : "industry"}<br />
                  <span style={{ fontSize: 14, opacity: 0.7 }}>to reveal skills in demand</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ marginTop: 28, padding: "18px 20px", borderRadius: "var(--tm-radius)", background: "var(--tm-surface)", border: "1px solid var(--tm-border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", boxShadow: "var(--tm-shadow-1)" }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--tm-text)", marginBottom: 3 }}>See how your skills stack up against this market</div>
          <div style={{ fontSize: 14, color: "var(--tm-text-faint)" }}>Upload your CV → get your Myro Score in 60 seconds</div>
        </div>
        <Link href="/signup" style={{ flexShrink: 0, padding: "10px 20px", borderRadius: 999, background: "var(--tm-accent-wash)", border: "1px solid var(--tm-accent-ring)", color: "var(--tm-accent)", fontSize: 14, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>
          Sign up to see your Myro Score →
        </Link>
      </div>
    </div>
  )
}
