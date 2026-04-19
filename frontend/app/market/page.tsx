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
        padding: "10px 14px", borderRadius: 8, cursor: "pointer",
        background: active ? "rgba(0,245,212,0.08)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${active ? "rgba(0,245,212,0.3)" : "rgba(255,255,255,0.05)"}`,
        transition: "all 0.2s", marginBottom: 4,
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)" }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.02)" }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 5, color: active ? "#00F5D4" : "#F0F4FF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {label}
        </div>
        <div style={{ height: 3, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: "linear-gradient(90deg,#00F5D4,rgba(0,245,212,0.4))", transition: "width 1s cubic-bezier(0.16,1,0.3,1)" }} />
        </div>
      </div>
      <div style={{ fontSize: 11, color: "rgba(240,244,255,0.4)", flexShrink: 0, minWidth: 40, textAlign: "right" }}>{count.toLocaleString()}</div>
      <div style={{ fontSize: 11, color: active ? "#00F5D4" : "rgba(240,244,255,0.25)" }}>›</div>
    </div>
  )
}

export default function MarketPage() {
  const [view, setView] = useState<"companies" | "industries">("companies")
  const [selected, setSelected] = useState<DrillEntity | null>(null)

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

  const list = view === "companies" ? companies : industries
  const max = list.reduce((m, e) => Math.max(m, e.roles), 0)
  const topSkills = analytics?.top_skills?.slice(0, 14) ?? []

  return (
    <AppShell>
      <div style={{ padding: "28px 32px", overflowY: "auto", height: "100%" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "rgba(0,245,212,0.7)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>Market Intelligence</div>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: "#F0F4FF", letterSpacing: "-0.02em", marginBottom: 4 }}>Intel</h1>
          <p style={{ fontSize: 13, color: "rgba(240,244,255,0.45)" }}>Live hiring signals · click any entity to reveal skill data</p>
        </div>

        {/* Signal banner */}
        {analytics && (
          <div style={{ padding: "16px 20px", borderRadius: 12, background: "rgba(0,245,212,0.04)", border: "1px solid rgba(0,245,212,0.15)", marginBottom: 24, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", right: 20, top: "50%", transform: "translateY(-50%)", fontSize: 48, color: "rgba(0,245,212,0.05)", pointerEvents: "none" }}>⚡</div>
            <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#00F5D4", marginBottom: 6 }}>Market Signal</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#F0F4FF", marginBottom: 4 }}>
              <span style={{ color: "#00F5D4" }}>{analytics.total_jobs.toLocaleString()}</span> jobs across{" "}
              <span style={{ color: "#00F5D4" }}>{analytics.total_companies.toLocaleString()}</span> companies in{" "}
              <span style={{ color: "#00F5D4" }}>{analytics.total_industries}</span> industries
            </div>
            {analytics.latest_batch && (
              <div style={{ fontSize: 12, color: "rgba(240,244,255,0.45)" }}>Latest batch: {analytics.latest_batch}</div>
            )}
          </div>
        )}

        {/* Top skills */}
        {topSkills.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(240,244,255,0.35)", marginBottom: 10 }}>Most demanded skills</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {topSkills.map((s) => (
                <span key={s.skill} style={{ fontSize: 11, padding: "5px 12px", borderRadius: 999, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(240,244,255,0.5)" }}>
                  {s.skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Toggle */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {(["companies", "industries"] as const).map((v) => (
            <button key={v} onClick={() => { setView(v); setSelected(null) }} style={{
              padding: "7px 18px", borderRadius: 999, fontSize: 12, fontWeight: 500,
              background: view === v ? "rgba(0,245,212,0.12)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${view === v ? "rgba(0,245,212,0.4)" : "rgba(255,255,255,0.08)"}`,
              color: view === v ? "#00F5D4" : "rgba(240,244,255,0.5)",
              cursor: "pointer", textTransform: "capitalize", transition: "all 0.2s", fontFamily: "inherit",
            }}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div style={{ color: "rgba(240,244,255,0.3)", fontSize: 13, padding: "32px 0", textAlign: "center" }}>Loading market data…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Bars */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(0,245,212,0.08)", borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(0,245,212,0.5)", marginBottom: 12 }}>
                {view === "companies" ? "Top Companies Hiring" : "Industry Breakdown"}
              </div>
              {list.length === 0 ? (
                <div style={{ color: "rgba(240,244,255,0.25)", fontSize: 13, padding: "32px 0", textAlign: "center" }}>No data yet</div>
              ) : (
                list.map((entity) => (
                  <IntelBar key={entity.name} label={entity.name} count={entity.roles} max={max}
                    active={selected?.name === entity.name}
                    onClick={() => setSelected(entity.name === selected?.name ? null : entity)} />
                ))
              )}
            </div>

            {/* Skill breakdown */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(0,245,212,0.08)", borderRadius: 14, padding: 16 }}>
              {selected ? (
                <>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#F0F4FF", marginBottom: 4 }}>{selected.name}</div>
                  <div style={{ fontSize: 11, color: "#00F5D4", marginBottom: 16 }}>{selected.roles.toLocaleString()} open roles</div>
                  {selected.skills.length > 0 ? (
                    <>
                      <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(240,244,255,0.3)", marginBottom: 10 }}>Skills in demand</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {selected.skills.slice(0, 10).map((s) => (
                          <div key={s} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(0,245,212,0.05)" }}>
                            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00F5D4", boxShadow: "0 0 6px #00F5D4" }} />
                            <span style={{ flex: 1, fontSize: 12, color: "#F0F4FF" }}>{s}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div style={{ color: "rgba(240,244,255,0.3)", fontSize: 12, padding: "16px 0" }}>No skill breakdown available.</div>
                  )}
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, color: "rgba(240,244,255,0.25)", fontSize: 13 }}>
                  <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>◉</div>
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
