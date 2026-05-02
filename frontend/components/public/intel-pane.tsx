"use client"

import Link from "next/link"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { jobs } from "@/lib/api"
import type { MarketAnalytics } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"

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
        background: active ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${active ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
        marginBottom: 4, fontFamily: "inherit", outline: "none",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--tm-hover)" }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.02)" }}
      onFocus={(e) => { e.currentTarget.style.boxShadow = "0 0 0 2px var(--tm-accent-ring)" }}
      onBlur={(e) => { e.currentTarget.style.boxShadow = "none" }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 500, marginBottom: 5, textAlign: "left",
          color: active ? "var(--tm-accent)" : "var(--tm-text)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {label}
        </div>
        <div style={{ height: 3, borderRadius: 999, background: "var(--tm-border-soft)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: "100%", borderRadius: 999, background: "var(--tm-accent)", transform: `scaleX(${pct / 100})`, transformOrigin: "left", transition: "transform 1s var(--tm-ease)" }} />
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

export function IntelPane() {
  const [view, setView] = useState<"companies" | "industries">("companies")
  const [selected, setSelected] = useState<DrillEntity | null>(null)
  const [skillFilters, setSkillFilters] = useState<Set<string>>(new Set())

  const { data: analytics } = useQuery({
    queryKey: dataKeys.jobsAnalyticsPublic(),
    queryFn: () => jobs.analytics(),
    staleTime: 5 * 60 * 1000,
  })

  const { companies, industries } = buildLists(analytics)
  const baseList = view === "companies" ? companies : industries
  const list = skillFilters.size > 0
    ? baseList.filter((e) => Array.from(skillFilters).every((f) => e.skills.some((s) => s.toLowerCase().includes(f.toLowerCase()))))
    : baseList
  const max = baseList.reduce((m, e) => Math.max(m, e.roles), 0)
  const topSkills = analytics?.top_skills?.slice(0, 14) ?? []
  const marketSummary = analytics
    ? `${analytics.total_jobs.toLocaleString()} jobs in ${analytics.total_companies.toLocaleString()} companies across ${analytics.total_industries.toLocaleString()} domains`
    : "Loading market coverage"

  return (
    <div className="tm-page-enter" style={{ padding: "var(--tm-page-py) var(--tm-page-px)" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: "var(--tm-accent)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6, opacity: 0.7 }}>
          {marketSummary}
        </div>
        <h1 style={{ fontSize: "var(--tm-fs-title)", fontWeight: 600, color: "var(--tm-text)", letterSpacing: "var(--tm-tracking-tight)", marginBottom: 4 }}>
          Intel
        </h1>
        <p style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-faint)" }}>
          Live hiring signals · click any entity to reveal skill data
        </p>
      </div>

      {analytics && (
        <div style={{ padding: "16px 20px", borderRadius: "var(--tm-radius)", background: "var(--tm-accent-wash)", border: "1px solid var(--tm-border-soft)", marginBottom: 24, position: "relative", overflow: "hidden" }}>
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

      {topSkills.length > 0 && (() => {
        const hard = topSkills.filter((s) => !issoft(s.skill))
        const soft = topSkills.filter((s) => issoft(s.skill))
        function toggleSkill(skill: string) {
          setSkillFilters((prev) => { const n = new Set(prev); if (n.has(skill)) { n.delete(skill) } else { n.add(skill) }; return n })
          setSelected(null)
        }
        const pillStyle = (a: boolean): React.CSSProperties => ({
          fontSize: 12, padding: "5px 12px", borderRadius: 999, cursor: "pointer",
          background: a ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.03)",
          border: `1px solid ${a ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
          color: a ? "var(--tm-accent)" : "var(--tm-text-muted)",
          fontFamily: "inherit", transition: "color var(--tm-dur-fast) var(--tm-ease), background var(--tm-dur-fast) var(--tm-ease), border-color var(--tm-dur-fast) var(--tm-ease), box-shadow var(--tm-dur-fast) var(--tm-ease)",
          boxShadow: a ? "var(--tm-shadow-glow)" : "none",
        })
        const SkillGroup = ({ label, items }: { label: string; items: typeof topSkills }) => (
          items.length === 0 ? null : (
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 8 }}>{label}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {items.map((s) => {
                  const a = skillFilters.has(s.skill)
                  return <button key={s.skill} onClick={() => toggleSkill(s.skill)} style={pillStyle(a)} aria-pressed={a}>{s.skill}</button>
                })}
              </div>
            </div>
          )
        )
        return (
          <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>
                {skillFilters.size > 0 && <><span style={{ color: "var(--tm-accent)", fontWeight: 600 }}>{skillFilters.size}</span> skill{skillFilters.size > 1 ? "s" : ""} selected — showing intersection</>}
              </div>
              {skillFilters.size > 0 && (
                <button onClick={() => { setSkillFilters(new Set()); setSelected(null) }} style={{ fontSize: 11, color: "var(--tm-text-faint)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "2px 6px" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--tm-danger)" }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--tm-text-faint)" }}
                >Clear ×</button>
              )}
            </div>
            <SkillGroup label="Hard Skills" items={hard} />
            {hard.length > 0 && soft.length > 0 && <div style={{ height: 1, background: "var(--tm-border-soft)" }} />}
            <SkillGroup label="Soft Skills" items={soft} />
          </div>
        )
      })()}

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {(["companies", "industries"] as const).map((v) => (
          <button key={v} onClick={() => { setView(v); setSelected(null); setSkillFilters(new Set()) }}
            style={{ padding: "7px 18px", borderRadius: 999, fontSize: 13, fontWeight: 500, background: view === v ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.03)", border: `1px solid ${view === v ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`, color: view === v ? "var(--tm-accent)" : "var(--tm-text-muted)", cursor: "pointer", textTransform: "capitalize", transition: "color var(--tm-dur) var(--tm-ease), background var(--tm-dur) var(--tm-ease), border-color var(--tm-dur) var(--tm-ease)", fontFamily: "inherit" }}
          >{v.charAt(0).toUpperCase() + v.slice(1)}</button>
        ))}
      </div>

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
                <IntelBar key={entity.name} label={entity.name} count={entity.roles} max={max}
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
                        <div key={s} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: "var(--tm-radius-sm)", background: "var(--tm-accent-wash)" }}>
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

      <div style={{ marginTop: 28, padding: "18px 20px", borderRadius: "var(--tm-radius)", background: "rgba(255,255,255,0.02)", border: "1px solid var(--tm-border-soft)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
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
