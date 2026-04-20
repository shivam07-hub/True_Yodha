"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { jobs } from "@/lib/api"
import { AppShell } from "@/components/app-shell"

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
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 14px", borderRadius: "var(--tm-radius-sm)", cursor: "pointer",
        background: active ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${active ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
        transition: "all var(--tm-dur) var(--tm-ease)", marginBottom: 4,
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)" }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.02)" }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 500, marginBottom: 5,
          color: active ? "var(--tm-accent)" : "var(--tm-text)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {label}
        </div>
        <div style={{ height: 3, borderRadius: 999, background: "var(--tm-border-soft)", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${pct}%`, borderRadius: 999,
            background: "var(--tm-accent)",
            transition: "width 1s var(--tm-ease)",
          }} />
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--tm-text-faint)", flexShrink: 0, minWidth: 40, textAlign: "right" }}>
        {count.toLocaleString()}
      </div>
      <div style={{ fontSize: 11, color: active ? "var(--tm-accent)" : "var(--tm-text-faint)" }}>›</div>
    </div>
  )
}

export default function MarketPage() {
  const [view, setView] = useState<"companies" | "industries">("companies")
  const [selected, setSelected] = useState<DrillEntity | null>(null)
  const [skillFilter, setSkillFilter] = useState<string | null>(null)

  const { data: analytics, isLoading } = useQuery({
    queryKey: ["jobs-analytics"],
    queryFn: () => jobs.analytics(),
    staleTime: 5 * 60 * 1000,
  })

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

  const baseList = view === "companies" ? companies : industries
  const list = skillFilter
    ? baseList.filter((e) => e.skills.some((s) => s.toLowerCase().includes(skillFilter.toLowerCase())))
    : baseList
  const max = baseList.reduce((m, e) => Math.max(m, e.roles), 0)
  const topSkills = analytics?.top_skills?.slice(0, 14) ?? []

  return (
    <AppShell>
      <div className="tm-page-enter" style={{ padding: "var(--tm-page-py) var(--tm-page-px)", overflowY: "auto", height: "100%" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "var(--tm-accent)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6, opacity: 0.7 }}>
            Market Intelligence
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
            background: "var(--tm-accent-wash)",
            border: "1px solid var(--tm-border-soft)",
            marginBottom: 24, position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", right: 20, top: "50%", transform: "translateY(-50%)", fontSize: 48, color: "var(--tm-accent)", opacity: 0.06, pointerEvents: "none" }}>⚡</div>
            <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-accent)", marginBottom: 6 }}>
              Market Signal
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--tm-text)", marginBottom: 4 }}>
              <span style={{ color: "var(--tm-accent)" }}>{analytics.total_jobs.toLocaleString()}</span> jobs across{" "}
              <span style={{ color: "var(--tm-accent)" }}>{analytics.total_companies.toLocaleString()}</span> companies in{" "}
              <span style={{ color: "var(--tm-accent)" }}>{analytics.total_industries}</span> industries
            </div>
            {analytics.latest_batch && (
              <div style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>Latest batch: {analytics.latest_batch}</div>
            )}
          </div>
        )}

        {/* Top skills */}
        {topSkills.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 10 }}>
              Most demanded skills{skillFilter && <span style={{ color: "var(--tm-accent)" }}> · filtering: {skillFilter}</span>}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {topSkills.map((s) => {
                const active = skillFilter === s.skill
                return (
                  <button
                    key={s.skill}
                    onClick={() => setSkillFilter(active ? null : s.skill)}
                    style={{
                      fontSize: 11, padding: "5px 12px", borderRadius: 999, cursor: "pointer",
                      background: active ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${active ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
                      color: active ? "var(--tm-accent)" : "var(--tm-text-muted)",
                      fontFamily: "inherit", transition: "all var(--tm-dur-fast) var(--tm-ease)",
                      boxShadow: active ? "var(--tm-shadow-glow)" : "none",
                    }}
                  >
                    {s.skill}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Toggle */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {(["companies", "industries"] as const).map((v) => (
            <button
              key={v}
              onClick={() => { setView(v); setSelected(null); setSkillFilter(null) }}
              style={{
                padding: "7px 18px", borderRadius: 999, fontSize: 12, fontWeight: 500,
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

        {isLoading ? (
          <div style={{ color: "var(--tm-text-faint)", fontSize: 13, padding: "32px 0", textAlign: "center" }}>
            Loading market data…
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Bars */}
            <div style={{
              background: "var(--tm-surface)",
              border: "1px solid var(--tm-border-soft)",
              borderRadius: "var(--tm-radius)",
              padding: 16,
            }}>
              <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-accent)", opacity: 0.6, marginBottom: 12 }}>
                {view === "companies" ? "Top Companies Hiring" : "Industry Breakdown"}
              </div>
              {list.length === 0 ? (
                <div style={{ color: "var(--tm-text-faint)", fontSize: 13, padding: "32px 0", textAlign: "center" }}>No data yet</div>
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

            {/* Skill breakdown */}
            <div style={{
              background: "var(--tm-surface)",
              border: "1px solid var(--tm-border-soft)",
              borderRadius: "var(--tm-radius)",
              padding: 16,
            }}>
              {selected ? (
                <>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)", marginBottom: 4 }}>{selected.name}</div>
                  <div style={{ fontSize: 11, color: "var(--tm-accent)", marginBottom: 16 }}>
                    {selected.roles.toLocaleString()} open roles
                  </div>
                  {selected.skills.length > 0 ? (
                    <>
                      <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 10 }}>
                        Skills in demand
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {selected.skills.slice(0, 10).map((s) => (
                          <div key={s} style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "8px 12px", borderRadius: "var(--tm-radius-sm)",
                            background: "var(--tm-accent-wash)",
                          }}>
                            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--tm-accent)", boxShadow: "0 0 6px var(--tm-accent-glow)", flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: 12, color: "var(--tm-text)" }}>{s}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div style={{ color: "var(--tm-text-faint)", fontSize: 12, padding: "16px 0" }}>No skill breakdown available.</div>
                  )}
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, color: "var(--tm-text-faint)", fontSize: 13 }}>
                  <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3, color: "var(--tm-accent)" }}>◉</div>
                  Select a {view === "companies" ? "company" : "industry"} to see skills
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
