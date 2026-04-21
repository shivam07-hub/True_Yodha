"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { jobs } from "@/lib/api"
import type { JobSearchItem } from "@/lib/api"
import { AppShell } from "@/components/app-shell"
import { useAuth } from "@/lib/hooks/use-auth"

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

interface TrackJob { job_id: string; job_title: string; company_name: string | null }

function TrackConfirmModal({ job, onConfirm, onClose }: { job: TrackJob; onConfirm: () => void; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", zIndex: 1, width: "min(420px, 90vw)", background: "var(--tm-surface)", border: "1px solid var(--tm-border)", borderRadius: "var(--tm-radius)", padding: "24px", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-accent)", marginBottom: 10, opacity: 0.7 }}>Track this role?</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)", marginBottom: 4 }}>{job.job_title}</div>
        <div style={{ fontSize: 13, color: "var(--tm-text-faint)", marginBottom: 20 }}>{job.company_name ?? ""}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { onConfirm(); onClose() }} style={{ flex: 1, padding: "9px", borderRadius: "var(--tm-radius-sm)", background: "var(--tm-accent-wash)", border: "1px solid var(--tm-accent-ring)", color: "var(--tm-accent)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Yes, track it →
          </button>
          <button onClick={onClose} style={{ padding: "9px 16px", borderRadius: "var(--tm-radius-sm)", background: "transparent", border: "1px solid var(--tm-border-soft)", color: "var(--tm-text-muted)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
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
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${label}, ${count.toLocaleString()} roles`}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%",
        padding: "10px 14px", borderRadius: "var(--tm-radius-sm)", cursor: "pointer",
        background: active ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${active ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
        marginBottom: 4, fontFamily: "inherit", outline: "none",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)" }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.02)" }}
      onFocus={(e) => { e.currentTarget.style.boxShadow = "0 0 0 2px var(--tm-accent-ring)" }}
      onBlur={(e) => { e.currentTarget.style.boxShadow = "none" }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 500, marginBottom: 5,
          color: active ? "var(--tm-accent)" : "var(--tm-text)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "left",
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
      <div style={{ fontSize: 12, color: "var(--tm-text-faint)", flexShrink: 0, minWidth: 40, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {count.toLocaleString()}
      </div>
      <div style={{ fontSize: 12, color: active ? "var(--tm-accent)" : "var(--tm-text-faint)" }} aria-hidden="true">›</div>
    </button>
  )
}

interface DrillSkill {
  company: string
  skill: string
}

export default function MarketPage() {
  const { token } = useAuth()
  const queryClient = useQueryClient()
  const [view, setView] = useState<"companies" | "industries">("companies")
  const [selected, setSelected] = useState<DrillEntity | null>(null)
  const [skillFilters, setSkillFilters] = useState<Set<string>>(new Set())
  const [drillSkill, setDrillSkill] = useState<DrillSkill | null>(null)
  const [expandedDesc, setExpandedDesc] = useState<string | null>(null)
  const [trackJob, setTrackJob] = useState<TrackJob | null>(null)

  const addToTracker = useMutation({
    mutationFn: (jobId: string) => jobs.updateApplication(token!, jobId, { status: "pending" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications", token] }),
  })

  const { data: analytics, isLoading } = useQuery({
    queryKey: ["jobs-analytics"],
    queryFn: () => jobs.analytics(),
    staleTime: 5 * 60 * 1000,
  })

  const { data: drillData, isLoading: drillLoading } = useQuery({
    queryKey: ["jobs-search", drillSkill?.company],
    queryFn: () => jobs.search(drillSkill!.company),
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
  const list = skillFilters.size > 0
    ? baseList.filter((e) =>
        Array.from(skillFilters).every((f) =>
          e.skills.some((s) => s.toLowerCase().includes(f.toLowerCase()))
        )
      )
    : baseList
  const max = baseList.reduce((m, e) => Math.max(m, e.roles), 0)
  const topSkills = analytics?.top_skills?.slice(0, 14) ?? []

  return (
    <>
    {trackJob && token && (
      <TrackConfirmModal
        job={trackJob}
        onConfirm={() => addToTracker.mutate(trackJob.job_id)}
        onClose={() => setTrackJob(null)}
      />
    )}
    <AppShell>
      <div className="tm-page-enter" style={{ padding: "var(--tm-page-py) var(--tm-page-px)", overflowY: "auto", height: "100%" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          {analytics && (
            <div style={{ fontSize: 12, color: "var(--tm-accent)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6, opacity: 0.7 }}>
              Market Intelligence · {analytics.total_jobs.toLocaleString()} jobs across {analytics.total_companies.toLocaleString()} companies in {analytics.total_industries} industries
            </div>
          )}
          <h1 style={{ fontSize: "var(--tm-fs-title)", fontWeight: 600, color: "var(--tm-text)", letterSpacing: "var(--tm-tracking-tight)", marginBottom: 4 }}>
            Intel
          </h1>
        </div>

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
                  {skillFilters.size === 0
                    ? "Select skills to find companies hiring for all of them"
                    : <><span style={{ color: "var(--tm-accent)", fontWeight: 600 }}>{skillFilters.size}</span> skill{skillFilters.size > 1 ? "s" : ""} selected — showing intersection</>}
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
              onClick={() => { setView(v); setSelected(null); setSkillFilters(new Set()); setDrillSkill(null); setExpandedDesc(null) }}
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

        {isLoading ? (
          <div style={{ color: "var(--tm-text-faint)", fontSize: 14, padding: "32px 0", textAlign: "center" }}>
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
                        padding: "3px 8px", fontSize: 12, fontFamily: "inherit",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--tm-accent-ring)"; e.currentTarget.style.color = "var(--tm-accent)" }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--tm-border-soft)"; e.currentTarget.style.color = "var(--tm-text-muted)" }}
                    >
                      ← Back
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tm-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {drillSkill.company}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--tm-accent)", marginTop: 1 }}>
                        All open roles · {drillLoading ? "…" : `${drillData?.total ?? 0} jobs`}
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
                      <div key={h} style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)" }}>{h}</div>
                    ))}
                  </div>

                  {/* Rows */}
                  <div style={{ overflowY: "auto", flex: 1, maxHeight: 420 }}>
                    {drillLoading ? (
                      <div style={{ padding: "32px 0", textAlign: "center", color: "var(--tm-text-faint)", fontSize: 13 }}>
                        Loading jobs…
                      </div>
                    ) : !drillData?.jobs.length ? (
                      <div style={{ padding: "32px 0", textAlign: "center", color: "var(--tm-text-faint)", fontSize: 13 }}>
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
                              fontSize: 11, color: "var(--tm-text-faint)",
                              fontFamily: "monospace", letterSpacing: "0.02em",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              paddingTop: 1,
                            }}>
                              {job.job_id}
                            </div>
                            {/* Title */}
                            <div
                              onClick={() => token && setTrackJob({ job_id: job.job_id, job_title: job.job_title, company_name: job.company_name })}
                              style={{
                                fontSize: 12, fontWeight: 500, color: token ? "var(--tm-accent)" : "var(--tm-text)",
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                cursor: token ? "pointer" : "default",
                                textDecoration: token ? "underline" : "none",
                                textDecorationColor: "var(--tm-accent-ring)",
                              }}
                            >
                              {job.job_title || "—"}
                            </div>
                            {/* Description */}
                            <div style={{ fontSize: 12, color: "var(--tm-text-muted)", lineHeight: 1.5 }}>
                              {isOpen ? (job.job_description || "No description") : (shortDesc + (hasMore ? "…" : "") || "No description")}
                              {hasMore && (
                                <button
                                  onClick={() => setExpandedDesc(isOpen ? null : job.job_id)}
                                  style={{
                                    marginLeft: 5, background: "none", border: "none",
                                    color: "var(--tm-accent)", cursor: "pointer", fontSize: 11,
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
                  <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)", marginBottom: 4 }}>{selected.name}</div>
                  <div style={{ fontSize: 12, color: "var(--tm-accent)", marginBottom: 14 }}>
                    {selected.roles.toLocaleString()} open roles
                  </div>
                  {selected.skills.length > 0 ? (
                    <>
                      <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 10 }}>
                        {selected.type === "company" ? "Click a skill to see matching jobs" : "Skills in demand"}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {[...selected.skills].slice(0, 10).map((s) => (
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
                            <span style={{ flex: 1, fontSize: 13, color: "var(--tm-text)" }}>{s}</span>
                            {selected.type === "company" && (
                              <span style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>›</span>
                            )}
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
      </div>
    </AppShell>
    </>
  )
}
