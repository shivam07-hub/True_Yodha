"use client"

import { useState, useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AppShell } from "@/components/app-shell"
import { StepCV } from "@/components/onboarding/step-cv"
import { jobs, scores, uploadCV, cv, users } from "@/lib/api"
import type { UserSkillItem } from "@/lib/api"
import { useAuth } from "@/lib/hooks/use-auth"

const STATUS_CONFIG = {
  strong:  { color: "var(--tm-success)", label: "Strong",  bg: "var(--tm-success-wash)" },
  exceeds: { color: "var(--tm-success)", label: "Exceeds", bg: "var(--tm-success-wash)" },
  close:   { color: "var(--tm-warning)", label: "Close",   bg: "var(--tm-warning-wash)" },
  gap:     { color: "var(--tm-warning)", label: "Gap",     bg: "var(--tm-warning-wash)" },
  missing: { color: "var(--tm-danger)",  label: "Missing", bg: "var(--tm-danger-wash)"  },
}

function levelToStatus(level: number): keyof typeof STATUS_CONFIG {
  if (level >= 4) return "strong"
  if (level === 3) return "close"
  if (level === 2) return "gap"
  return "missing"
}

const LEVEL_TITLES: Record<number, string> = {
  1: "Scout", 2: "Trailblazer", 3: "Excavator", 4: "Cartographer", 5: "Legend",
}

function howToLevelUp(skillName: string, currentLevel: number): string {
  switch (currentLevel) {
    case 1: return `Apply ${skillName} in a real project that produces tangible outcomes. Freelance, volunteer, or client work all count — the key is moving beyond tutorials into something shipped. Tie it to a result: users, revenue, or a live product.`
    case 2: return `Deploy ${skillName} inside an organisation's operating lifecycle at scale. You need measurable business impact — process improved by X%, cost reduced by $Y, system serving Z users. The outcome must be quantifiable and repeatable, not just "used in a project".`
    case 3: return `Reach architect-level breadth across your entire skill cluster — not just ${skillName} in isolation. Make the architectural decisions, set the standards, and mentor others in the full domain. Coverage of adjacent skills in the same cluster is required.`
    case 4: return `Become industry-recognised. Publish, speak at conferences, or ship something notable enough that others adopt your approach to ${skillName}. You also need L4 mastery in at least two other skill clusters simultaneously.`
    default: return `You are already at the top level for ${skillName}. Maintain thought leadership: open-source contributions, publications, or standards-body involvement.`
  }
}

function cvExample(skillName: string, currentLevel: number): string {
  switch (currentLevel) {
    case 1: return `"Built a ${skillName}-powered [feature/tool] for [Project Name], which [attracted X users / generated £Y revenue / improved Z metric] within [timeframe]." — Replace the bracketed parts with your specifics. The key signal: something was shipped and someone used it.`
    case 2: return `"Led end-to-end implementation of ${skillName} across [Company]'s [system/product], reducing [metric] by X% and enabling [business outcome] for [scale, e.g. 50k+ users or £Xm revenue]." — Show ownership, scale, and a number.`
    case 3: return `"Architected the ${skillName} standards and practices adopted across [Team/Org] — defined the framework used by [N] engineers, reduced [metric] by X%, and eliminated [problem] at scale." — You own the map, not just a path through it.`
    case 4: return `"Published [research / talk / framework] on ${skillName} adopted by [N] teams industry-wide. Recognised as [award / keynote speaker / standards contributor] at [event / organisation]." — Others follow your lead.`
    default: return `You are already at the highest level. Consider contributing to open-source, publishing benchmarks, or advising standards bodies in the ${skillName} domain.`
  }
}

function SkillRow({ skill, delay = 0, highlighted }: { skill: UserSkillItem; delay?: number; highlighted: boolean }) {
  const [clickState, setClickState] = useState<0 | 1 | 2 | 3>(0)
  const statusKey = levelToStatus(skill.level)
  const cfg = STATUS_CONFIG[statusKey]
  const isMaxLevel = skill.level >= 5

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    setClickState((s) => (s === 3 ? 0 : (s + 1) as 0 | 1 | 2 | 3))
  }

  const nextLevelTitle = LEVEL_TITLES[skill.level + 1]

  return (
    <div
      style={{
        borderRadius: "var(--tm-radius)",
        padding: "12px 14px",
        background: highlighted ? "var(--tm-accent-wash)" : clickState > 0 ? cfg.bg : "rgba(255,255,255,0.02)",
        border: highlighted
          ? "1px solid var(--tm-accent-ring)"
          : clickState > 0
          ? `1px solid ${cfg.color}`
          : "1px solid var(--tm-border-soft)",
        borderLeft: highlighted ? "2px solid var(--tm-accent)" : undefined,
        transition: "all var(--tm-dur) var(--tm-ease)",
        cursor: "pointer",
      }}
      onClick={handleClick}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: cfg.color, flexShrink: 0,
          boxShadow: `0 0 6px ${cfg.color}`,
        }} />
        <span style={{ flex: 1, fontSize: "var(--tm-fs-meta)", fontWeight: 500, color: "var(--tm-text)" }}>
          {skill.display_name}
        </span>
        {clickState === 0 && (
          <span style={{ fontSize: 10, color: "var(--tm-text-faint)", letterSpacing: "0.05em" }}>
            tap to explore ↓
          </span>
        )}
        <span style={{
          fontSize: 11, padding: "2px 8px", borderRadius: 999,
          background: cfg.bg, color: cfg.color,
          border: `1px solid ${cfg.color}`, opacity: 0.9, flexShrink: 0,
        }}>
          L{skill.level} · {cfg.label}
        </span>
      </div>

      <div style={{ height: 2, borderRadius: 999, background: "var(--tm-border-soft)", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 999,
          width: `${(skill.level / 5) * 100}%`,
          background: "linear-gradient(90deg, var(--tm-accent), var(--tm-accent-wash))",
          transition: `width ${0.8 + delay * 0.001}s var(--tm-ease)`,
        }} />
      </div>

      {/* State 1 — CV source evidence */}
      {clickState === 1 && (
        <div style={{ marginTop: 10 }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 6,
          }}>
            <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: cfg.color, fontWeight: 600 }}>
              Extracted from your CV
            </span>
            <span style={{ fontSize: 10, color: "var(--tm-text-faint)" }}>tap again to level up →</span>
          </div>
          <div style={{
            padding: "10px 12px", borderRadius: "var(--tm-radius-sm)",
            background: "rgba(255,255,255,0.03)",
            border: `1px solid ${cfg.color}30`,
            fontSize: 12, color: "var(--tm-text-muted)", lineHeight: 1.7,
            fontStyle: "italic",
          }}>
            {skill.evidence_text
              ? `"${skill.evidence_text}"`
              : `No direct quote captured — ${skill.display_name} was inferred from the overall context of your CV.`}
          </div>
        </div>
      )}

      {/* State 2 — How to reach next level */}
      {clickState === 2 && (
        <div style={{ marginTop: 10 }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 6,
          }}>
            <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: cfg.color, fontWeight: 600 }}>
              {isMaxLevel ? "Max Level" : `How to reach ${nextLevelTitle} (L${skill.level + 1})`}
            </span>
            <span style={{ fontSize: 10, color: "var(--tm-text-faint)" }}>tap again for CV example →</span>
          </div>
          <div style={{
            padding: "10px 12px", borderRadius: "var(--tm-radius-sm)",
            background: "rgba(255,255,255,0.03)",
            border: `1px solid ${cfg.color}30`,
            fontSize: 12, color: "var(--tm-text-muted)", lineHeight: 1.7,
          }}>
            {howToLevelUp(skill.display_name, skill.level)}
          </div>
        </div>
      )}

      {/* State 3 — CV example bullet */}
      {clickState === 3 && (
        <div style={{ marginTop: 10 }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 6,
          }}>
            <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-accent)", fontWeight: 600 }}>
              CV bullet · L{skill.level + 1} signal
            </span>
            <span style={{ fontSize: 10, color: "var(--tm-text-faint)" }}>tap again to close ↺</span>
          </div>
          <div style={{
            padding: "10px 12px", borderRadius: "var(--tm-radius-sm)",
            background: "var(--tm-accent-wash)",
            border: "1px solid var(--tm-accent-ring)",
            fontSize: 12, color: "var(--tm-text-muted)", lineHeight: 1.7,
            fontStyle: "italic",
          }}>
            {cvExample(skill.display_name, skill.level)}
          </div>
        </div>
      )}
    </div>
  )
}

function ClusterSection({ cluster, skills, highlighted }: { cluster: string; skills: UserSkillItem[]; highlighted: string | null }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="tm-label-caps" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
        <span>{cluster}</span>
        <span style={{ fontSize: 10, color: "var(--tm-text-faint)" }}>{skills.length} skills</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {skills.map((s, i) => (
          <SkillRow
            key={s.key}
            skill={s}
            delay={i * 60}
            highlighted={highlighted ? s.display_name.toLowerCase().includes(highlighted.toLowerCase()) : false}
          />
        ))}
      </div>
    </div>
  )
}

export default function CVPage() {
  const { token, ready } = useAuth()
  const queryClient = useQueryClient()
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [catFilter, setCatFilter] = useState<"all" | "technical" | "domain" | "soft">("all")
  const [statusFilter, setStatusFilter] = useState<"all" | "strong" | "gap" | "critical">("all")
  const [highlightedSkill] = useState<string | null>(null)
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null)

  const { data: cvProfile, isLoading: cvLoading } = useQuery({
    queryKey: ["cv-profile", token],
    queryFn: () => cv.me(token!),
    enabled: !!token,
  })

  const { data: skillsData, isLoading: skillsLoading } = useQuery({
    queryKey: ["user-skills", token],
    queryFn: () => users.mySkills(token!),
    enabled: !!token,
  })

  const { data: scoreData } = useQuery({
    queryKey: ["scores", token],
    queryFn: () => scores.me(token!),
    enabled: !!token,
  })

  async function handleUpload(file: File) {
    if (!token) return
    setUploading(true)
    setError(null)
    setMessage(null)
    try {
      const result = await uploadCV(token, file)
      await scores.compute(token)
      await jobs.compute(token).catch(() => null)
      queryClient.invalidateQueries({ queryKey: ["scores", token] })
      queryClient.invalidateQueries({ queryKey: ["jobs", token] })
      queryClient.invalidateQueries({ queryKey: ["cv-profile", token] })
      queryClient.invalidateQueries({ queryKey: ["user-skills", token] })
      setMessage(`${result.skills_detected} skills detected · Score: ${result.score}`)
      setShowUpload(false)
      setSelectedVersionId(null) // snap back to latest after new upload
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload CV")
    } finally {
      setUploading(false)
    }
  }

  const hasCv = !!cvProfile?.cv_raw_text || (cvProfile?.history?.length ?? 0) > 0

  // Auto-open upload panel once per mount when no CV exists at all
  const autoOpenFiredRef = useRef(false)
  useEffect(() => {
    if (!cvLoading && !hasCv && !autoOpenFiredRef.current) {
      autoOpenFiredRef.current = true
      setShowUpload(true)
    }
  }, [cvLoading, hasCv])

  if (!ready) return null

  const domainKeywords: Record<string, string[]> = {
    technical: ["engineering", "programming", "software", "data", "cloud", "devops", "infrastructure", "database", "api", "security", "systems", "network", "code"],
    domain:    ["finance", "analytics", "product", "strategy", "business", "marketing", "operations", "management", "research", "science"],
    soft:      ["communication", "leadership", "collaboration", "soft", "interpersonal", "teamwork", "presentation", "writing", "people"],
  }

  const allClusterEntries = Object.entries(skillsData?.by_cluster ?? {}).sort(([, a], [, b]) => b.length - a.length)
  const clusterEntries = catFilter === "all"
    ? allClusterEntries
    : (() => {
        const domainEntries = Object.entries(skillsData?.by_domain ?? {})
        if (domainEntries.length > 0) {
          const keywords = domainKeywords[catFilter] ?? []
          const matchingDomain = domainEntries
            .filter(([domain]) => keywords.some((kw) => domain.toLowerCase().includes(kw)))
          if (matchingDomain.length > 0) {
            return matchingDomain.sort(([, a], [, b]) => b.length - a.length)
          }
        }
        const keywords = domainKeywords[catFilter] ?? []
        return allClusterEntries.filter(([cluster]) =>
          keywords.some((kw) => cluster.toLowerCase().includes(kw))
        )
      })()

  const totalSkills = allClusterEntries.reduce((n, [, s]) => n + s.length, 0)

  function matchesStatus(level: number): boolean {
    if (statusFilter === "strong")   return level >= 4
    if (statusFilter === "gap")      return level >= 2 && level < 4
    if (statusFilter === "critical") return level < 2
    return true
  }

  const filteredClusterEntries = statusFilter === "all"
    ? clusterEntries
    : clusterEntries
        .map(([cluster, skills]) => [cluster, skills.filter((s) => matchesStatus(s.level))] as [string, typeof skills])
        .filter(([, skills]) => skills.length > 0)

  const counts = clusterEntries.reduce((acc, [, skills]) => {
    skills.forEach((s) => {
      if (s.level >= 4) acc.strong++
      else if (s.level >= 2) acc.gap++
      else acc.critical++
    })
    return acc
  }, { strong: 0, gap: 0, critical: 0 })

  // Determine text to show in viewer
  const selectedVersion = selectedVersionId !== null
    ? cvProfile?.history?.find((v) => v.id === selectedVersionId) ?? null
    : null
  const displayText = selectedVersion?.cv_raw_text ?? cvProfile?.cv_raw_text ?? null

  return (
    <AppShell>
      <div className="tm-page-enter" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "24px 32px 16px", flexShrink: 0 }}>
          <div className="tm-label-caps" style={{ marginBottom: 6 }}>CV Skill Mapping</div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
            <div>
              <h1 className="tm-title" style={{ marginBottom: 3, fontSize: "var(--tm-fs-heading)" }}>Your Skill Profile</h1>
              <p className="tm-meta" style={{ fontSize: 12 }}>Extracted from CV · mapped against market</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => setShowUpload((v) => !v)}
                className="tm-btn tm-btn-ghost"
                style={{
                  height: 36,
                  fontSize: "var(--tm-fs-meta)",
                  ...(showUpload ? {
                    background: "var(--tm-accent-wash)",
                    border: "1px solid var(--tm-accent-ring)",
                    color: "var(--tm-accent)",
                    boxShadow: "0 0 12px var(--tm-accent-glow)",
                  } : {}),
                }}
              >
                {"↑"} {hasCv ? "Replace CV" : "Upload CV"}
              </button>
            </div>
          </div>

          {/* Summary stats */}
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
            {[
              { label: "Strong",   key: "strong",   count: counts.strong,   color: "var(--tm-success)", wash: "var(--tm-success-wash)" },
              { label: "Gaps",     key: "gap",      count: counts.gap,       color: "var(--tm-warning)", wash: "var(--tm-warning-wash)" },
              { label: "Critical", key: "critical", count: counts.critical,  color: "var(--tm-danger)",  wash: "var(--tm-danger-wash)"  },
            ].map(({ label, key, count, color, wash }) => {
              const active = statusFilter === key
              return (
                <button
                  key={label}
                  onClick={() => setStatusFilter(active ? "all" : key as typeof statusFilter)}
                  style={{
                    padding: "6px 14px", borderRadius: "var(--tm-radius-sm)",
                    background: active ? color : wash,
                    border: `1px solid ${color}`,
                    display: "flex", alignItems: "center", gap: 8,
                    cursor: "pointer", fontFamily: "inherit",
                    boxShadow: active ? `0 0 10px ${color}40` : "none",
                    transition: "all var(--tm-dur) var(--tm-ease)",
                    outline: "none",
                  }}
                >
                  <span style={{ fontSize: "var(--tm-fs-body)", fontWeight: 700, color: active ? "var(--tm-bg)" : color, lineHeight: 1 }}>{count}</span>
                  <span style={{ fontSize: 12, color: active ? "var(--tm-bg)" : "inherit" }}>{label}</span>
                </button>
              )
            })}
            {scoreData && (
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--tm-text-muted)" }}>Truth Score:</span>
                <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: "var(--tm-fs-body)", fontWeight: 600, color: "var(--tm-text)" }}>
                  {Math.round(scoreData.total_score)}
                </span>
                <span style={{ fontSize: 12, color: "var(--tm-text-muted)" }}>/100 · {totalSkills} skills</span>
              </div>
            )}
          </div>

        </div>

        {/* Split body */}
        <div style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          overflow: "hidden",
          borderTop: "1px solid var(--tm-border-soft)",
        }}>
          {/* LEFT — Skill mapping */}
          <div style={{ overflowY: "auto", padding: "16px 20px 24px 32px", borderRight: "1px solid var(--tm-border-soft)" }}>
            <div style={{ display: "flex", gap: 5, marginBottom: 14 }}>
              {(["all", "technical", "domain", "soft"] as const).map((c) => (
                <button key={c} onClick={() => setCatFilter(c)} style={{
                  padding: "5px 12px", borderRadius: 999,
                  fontSize: "var(--tm-fs-meta)", fontWeight: 500,
                  background: catFilter === c ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${catFilter === c ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
                  color: catFilter === c ? "var(--tm-accent)" : "var(--tm-text-muted)",
                  cursor: "pointer", textTransform: "capitalize",
                  transition: "all var(--tm-dur) var(--tm-ease)",
                  fontFamily: "inherit",
                }}>{c}</button>
              ))}
            </div>

            {skillsLoading ? (
              <div style={{ color: "var(--tm-text-faint)", fontSize: "var(--tm-fs-meta)", padding: "32px 0", textAlign: "center" }}>
                Loading skills…
              </div>
            ) : filteredClusterEntries.length === 0 ? (
              <div style={{ padding: "32px", textAlign: "center", color: "var(--tm-text-faint)", fontSize: "var(--tm-fs-meta)" }}>
                <div style={{ fontSize: 33, marginBottom: 12, opacity: 0.3 }}>◈</div>
                {clusterEntries.length === 0 ? "Upload a CV to see extracted skills" : `No ${statusFilter} skills in this view`}
              </div>
            ) : (
              filteredClusterEntries.map(([cluster, skills]) => (
                <ClusterSection
                  key={cluster}
                  cluster={cluster}
                  skills={skills}
                  highlighted={highlightedSkill}
                />
              ))
            )}
          </div>

          {/* RIGHT — Version history + CV viewer */}
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* Version timeline */}
            <div style={{
              padding: "14px 20px 12px",
              borderBottom: "1px solid var(--tm-border-soft)",
              flexShrink: 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: cvProfile?.history?.length ? 10 : 0 }}>
                <div className="tm-label-caps">CV Versions</div>
                {!!cvProfile?.history?.length && (
                  <span style={{
                    fontSize: 10, color: "var(--tm-text-faint)",
                    background: "rgba(255,255,255,0.04)", padding: "1px 7px",
                    borderRadius: 999, border: "1px solid var(--tm-border-soft)",
                  }}>
                    {cvProfile.history.length}
                  </span>
                )}
              </div>

              {!!cvProfile?.history?.length && (
                <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
                  {cvProfile.history.map((v, i) => {
                    const isLatest = i === 0
                    const isSelected = selectedVersionId === v.id || (selectedVersionId === null && isLatest)
                    const prev = cvProfile.history[i + 1]
                    const delta = prev ? Math.round(v.mirror_score - prev.mirror_score) : null
                    return (
                      <button
                        key={v.id}
                        onClick={() => setSelectedVersionId(isLatest ? null : v.id)}
                        style={{
                          flexShrink: 0,
                          padding: "6px 10px",
                          borderRadius: "var(--tm-radius-sm)",
                          background: isSelected ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.03)",
                          border: `1px solid ${isSelected ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
                          cursor: "pointer", fontFamily: "inherit",
                          transition: "all var(--tm-dur) var(--tm-ease)",
                          outline: "none", textAlign: "left",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          {isLatest && (
                            <span style={{
                              fontSize: 9, padding: "1px 5px", borderRadius: 999,
                              background: "var(--tm-accent)", color: "var(--tm-bg)",
                              fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase",
                            }}>Active</span>
                          )}
                          <span style={{
                            fontSize: 11, fontFamily: "var(--tm-font-mono)", fontWeight: 600,
                            color: isSelected ? "var(--tm-accent)" : "var(--tm-text-muted)",
                          }}>
                            v{cvProfile.history.length - i}
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: "var(--tm-text-faint)", marginTop: 2 }}>
                          {new Date(v.uploaded_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
                          <span style={{
                            fontSize: 10, fontFamily: "var(--tm-font-mono)",
                            color: isSelected ? "var(--tm-accent)" : "var(--tm-text-faint)",
                          }}>
                            {Math.round(v.mirror_score)}
                          </span>
                          {delta !== null && (
                            <span style={{
                              fontSize: 9, fontWeight: 700,
                              color: delta >= 0 ? "var(--tm-success)" : "var(--tm-danger)",
                            }}>
                              {delta >= 0 ? `+${delta}` : delta}
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* CV text viewer */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 32px 20px", position: "relative" }}>
              <div style={{
                position: "absolute", right: 24, top: 20,
                fontSize: 81, color: "var(--tm-accent-wash)",
                pointerEvents: "none", userSelect: "none", lineHeight: 1,
              }}>◈</div>

              {cvLoading ? (
                <p style={{ color: "var(--tm-text-faint)", fontSize: "var(--tm-fs-meta)" }}>Loading…</p>
              ) : displayText ? (
                <pre style={{
                  fontSize: 12.5, lineHeight: 1.8, color: "var(--tm-text-muted)",
                  fontFamily: "var(--tm-font-mono)", whiteSpace: "pre-wrap",
                  wordBreak: "break-word", position: "relative",
                }}>
                  {displayText.split("\n").map((line, i) => {
                    const isHighlighted = !!highlightedSkill && line.toLowerCase().includes(highlightedSkill.toLowerCase().split(" ")[0])
                    return (
                      <span key={i} style={{
                        display: "block",
                        background: isHighlighted ? "var(--tm-accent-wash)" : "transparent",
                        borderLeft: isHighlighted ? "2px solid var(--tm-accent)" : "2px solid transparent",
                        paddingLeft: 6, borderRadius: 2,
                        transition: "all var(--tm-dur)",
                        color: line.startsWith("─") ? "var(--tm-accent-wash)"
                          : (line.match(/^[A-Z ]+$/) && line.length > 3) ? "var(--tm-text)"
                          : "var(--tm-text-muted)",
                        fontWeight: (line.match(/^[A-Z ]+$/) && line.length > 3) ? 600 : 400,
                      }}>
                        {line || " "}
                      </span>
                    )
                  })}
                </pre>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--tm-text-faint)", textAlign: "center", gap: 12 }}>
                  <div style={{ fontSize: 49, opacity: 0.2 }}>◈</div>
                  <p style={{ fontSize: "var(--tm-fs-meta)" }}>No CV uploaded yet.</p>
                  <p style={{ fontSize: 12 }}>Use the button above to upload.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Upload modal overlay */}
      {showUpload && (
        <div
          onClick={() => setShowUpload(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 50,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 560,
              borderRadius: "var(--tm-radius)",
              background: "var(--tm-surface)",
              border: "1px solid var(--tm-accent-ring)",
              boxShadow: "0 0 48px var(--tm-accent-glow), 0 24px 64px rgba(0,0,0,0.6)",
              position: "relative",
              padding: 28,
            }}
          >
            {/* Close */}
            <button
              onClick={() => setShowUpload(false)}
              style={{
                position: "absolute", top: 12, right: 12,
                width: 28, height: 28, borderRadius: "50%",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--tm-border-soft)",
                color: "var(--tm-text-faint)",
                fontSize: 14, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "inherit", transition: "all var(--tm-dur) var(--tm-ease)",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--tm-danger-wash)"
                ;(e.currentTarget as HTMLButtonElement).style.color = "var(--tm-danger)"
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = "var(--tm-danger)"
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"
                ;(e.currentTarget as HTMLButtonElement).style.color = "var(--tm-text-faint)"
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = "var(--tm-border-soft)"
              }}
              aria-label="Close upload panel"
            >
              ✕
            </button>

            <div className="tm-label-caps" style={{ marginBottom: 6 }}>
              {hasCv ? "Replace CV" : "Upload CV"}
            </div>
            <h2 style={{ fontSize: "var(--tm-fs-heading)", fontWeight: 600, color: "var(--tm-text)", marginBottom: 20 }}>
              {hasCv ? "Upload a new version" : "Upload your CV"}
            </h2>

            {uploading && (
              <p style={{ marginBottom: 12, fontSize: "var(--tm-fs-meta)", color: "var(--tm-accent)" }}>
                Reading your CV and matching to market…
              </p>
            )}
            {message && (
              <p style={{ marginBottom: 8, fontSize: "var(--tm-fs-meta)", color: "var(--tm-accent)" }}>{message}</p>
            )}
            {error && (
              <p style={{ marginBottom: 8, fontSize: "var(--tm-fs-meta)", color: "var(--tm-danger)" }}>{error}</p>
            )}
            <StepCV onNext={handleUpload} />
          </div>
        </div>
      )}
    </AppShell>
  )
}
