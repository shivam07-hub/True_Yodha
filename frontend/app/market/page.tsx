"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { jobs } from "@/lib/api"
import type { JobSearchItem } from "@/lib/api"
import { AppShell } from "@/components/app-shell"

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

interface DrillSkill {
  company: string
  skill: string
}

export default function MarketPage() {
  const [view, setView] = useState<"companies" | "industries">("companies")
  const [selected, setSelected] = useState<DrillEntity | null>(null)
  const [skillFilter, setSkillFilter] = useState<string | null>(null)
  const [drillSkill, setDrillSkill] = useState<DrillSkill | null>(null)
  const [expandedDesc, setExpandedDesc] = useState<string | null>(null)

  const { data: analytics, isLoading } = useQuery({
    queryKey: ["jobs-analytics"],
    queryFn: () => jobs.analytics(),
    staleTime: 5 * 60 * 1000,
  })

  const { data: drillData, isLoading: drillLoading } = useQuery({
    queryKey: ["jobs-search", drillSkill?.company, drillSkill?.skill],
    queryFn: () => jobs.search(drillSkill!.company, drillSkill!.skill),
    enabled: !!drillSkill,
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

        {/* Top skills — split hard / soft */}
        {topSkills.length > 0 && (() => {
          const hard = topSkills.filter((s) => !issoft(s.skill))
          const soft = topSkills.filter((s) => issoft(s.skill))
          const pillStyle = (active: boolean): React.CSSProperties => ({
            fontSize: 11, padding: "5px 12px", borderRadius: 999, cursor: "pointer",
            background: active ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${active ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
            color: active ? "var(--tm-accent)" : "var(--tm-text-muted)",
            fontFamily: "inherit", transition: "all var(--tm-dur-fast) var(--tm-ease)",
            boxShadow: active ? "var(--tm-shadow-glow)" : "none",
          })
          const SkillGroup = ({ label, items }: { label: string; items: typeof topSkills }) => (
            items.length === 0 ? null : (
              <div>
                <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 8 }}>
                  {label}{skillFilter && label === "Most demanded skills" && <span style={{ color: "var(--tm-accent)" }}> · filtering: {skillFilter}</span>}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {items.map((s) => {
                    const active = skillFilter === s.skill
                    return (
                      <button key={s.skill} onClick={() => setSkillFilter(active ? null : s.skill)} style={pillStyle(active)}>
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
              onClick={() => { setView(v); setSelected(null); setSkillFilter(null); setDrillSkill(null); setExpandedDesc(null) }}
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
                    onClick={() => { setSelected(entity.name === selected?.name ? null : entity); setDrillSkill(null); setExpandedDesc(null) }}
                  />
                ))
              )}
            </div>

            {/* Right panel — skills or job drill */}
            <div style={{
              background: "var(--tm-surface)",
              border: "1px solid var(--tm-border-soft)",
              borderRadius: "var(--tm-radius)",
              padding: 16,
              overflow: "hidden",
              display: "flex", flexDirection: "column",
            }}>
              {drillSkill && selected?.type === "company" ? (
                /* ── Job drill-down view ── */
                <>
                  {/* Header row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <button
                      onClick={() => { setDrillSkill(null); setExpandedDesc(null) }}
                      style={{
                        background: "none", border: "1px solid var(--tm-border-soft)",
                        borderRadius: 6, color: "var(--tm-text-muted)", cursor: "pointer",
                        padding: "3px 8px", fontSize: 11, fontFamily: "inherit",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--tm-accent-ring)"; e.currentTarget.style.color = "var(--tm-accent)" }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--tm-border-soft)"; e.currentTarget.style.color = "var(--tm-text-muted)" }}
                    >
                      ← Back
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tm-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {drillSkill.company}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--tm-accent)", marginTop: 1 }}>
                        {drillSkill.skill} · {drillLoading ? "…" : `${drillData?.total ?? 0} roles`}
                      </div>
                    </div>
                  </div>

                  {/* Column headers */}
                  <div style={{
                    display: "grid", gridTemplateColumns: "2fr 2fr 3fr",
                    gap: 8, padding: "6px 10px", marginBottom: 6,
                    borderBottom: "1px solid var(--tm-border-soft)",
                  }}>
                    {["Job ID", "Job Title", "Description"].map((h) => (
                      <div key={h} style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>{h}</div>
                    ))}
                  </div>

                  {/* Rows */}
                  <div style={{ overflowY: "auto", flex: 1, maxHeight: 420 }}>
                    {drillLoading ? (
                      <div style={{ padding: "32px 0", textAlign: "center", color: "var(--tm-text-faint)", fontSize: 12 }}>
                        Loading jobs…
                      </div>
                    ) : !drillData?.jobs.length ? (
                      <div style={{ padding: "32px 0", textAlign: "center", color: "var(--tm-text-faint)", fontSize: 12 }}>
                        No matching jobs found
                      </div>
                    ) : (
                      drillData.jobs.map((job: JobSearchItem) => {
                        const isOpen = expandedDesc === job.job_id
                        const shortDesc = (job.job_description || "").slice(0, 120)
                        const hasMore = (job.job_description || "").length > 120
                        return (
                          <div
                            key={job.job_id}
                            style={{
                              display: "grid", gridTemplateColumns: "2fr 2fr 3fr",
                              gap: 8, padding: "9px 10px",
                              borderBottom: "1px solid var(--tm-border-soft)",
                              transition: "background 0.12s",
                              cursor: "default",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
                            {/* Job ID */}
                            <div style={{
                              fontSize: 10, color: "var(--tm-text-faint)",
                              fontFamily: "monospace", letterSpacing: "0.02em",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              paddingTop: 1,
                            }}>
                              {job.job_id}
                            </div>
                            {/* Title */}
                            <div style={{
                              fontSize: 11, fontWeight: 500, color: "var(--tm-text)",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {job.job_title || "—"}
                            </div>
                            {/* Description */}
                            <div style={{ fontSize: 11, color: "var(--tm-text-muted)", lineHeight: 1.5 }}>
                              {isOpen ? (job.job_description || "No description") : (shortDesc + (hasMore ? "…" : "") || "No description")}
                              {hasMore && (
                                <button
                                  onClick={() => setExpandedDesc(isOpen ? null : job.job_id)}
                                  style={{
                                    marginLeft: 5, background: "none", border: "none",
                                    color: "var(--tm-accent)", cursor: "pointer", fontSize: 10,
                                    fontFamily: "inherit", padding: 0, textDecoration: "underline",
                                  }}
                                >
                                  {isOpen ? "less" : "more"}
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </>
              ) : selected ? (
                /* ── Skills list view ── */
                <>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--tm-text)", marginBottom: 4 }}>{selected.name}</div>
                  <div style={{ fontSize: 11, color: "var(--tm-accent)", marginBottom: 14 }}>
                    {selected.roles.toLocaleString()} open roles
                  </div>
                  {selected.skills.length > 0 ? (
                    <>
                      <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 10 }}>
                        {selected.type === "company" ? "Click a skill to see matching jobs" : "Skills in demand"}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {selected.skills.slice(0, 10).map((s) => (
                          <div
                            key={s}
                            onClick={() => selected.type === "company" ? setDrillSkill({ company: selected.name, skill: s }) : undefined}
                            style={{
                              display: "flex", alignItems: "center", gap: 10,
                              padding: "8px 12px", borderRadius: "var(--tm-radius-sm)",
                              background: "var(--tm-accent-wash)",
                              cursor: selected.type === "company" ? "pointer" : "default",
                              border: "1px solid transparent",
                              transition: "all 0.15s",
                            }}
                            onMouseEnter={(e) => { if (selected.type === "company") { e.currentTarget.style.borderColor = "var(--tm-accent-ring)"; e.currentTarget.style.background = "rgba(0,245,212,0.08)" } }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "var(--tm-accent-wash)" }}
                          >
                            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--tm-accent)", boxShadow: "0 0 6px var(--tm-accent-glow)", flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: 12, color: "var(--tm-text)" }}>{s}</span>
                            {selected.type === "company" && (
                              <span style={{ fontSize: 10, color: "var(--tm-text-faint)" }}>›</span>
                            )}
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
