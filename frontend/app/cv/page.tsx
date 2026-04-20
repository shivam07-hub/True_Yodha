"use client"

import { useState } from "react"
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

function SkillRow({ skill, delay = 0, highlighted }: { skill: UserSkillItem; delay?: number; highlighted: boolean }) {
  const [open, setOpen] = useState(false)
  const statusKey = levelToStatus(skill.level)
  const cfg = STATUS_CONFIG[statusKey]

  return (
    <div
      onClick={() => setOpen((o) => !o)}
      style={{
        borderRadius: "var(--tm-radius)",
        padding: "12px 14px",
        background: highlighted ? "var(--tm-accent-wash)" : open ? cfg.bg : "rgba(255,255,255,0.02)",
        border: highlighted
          ? "1px solid var(--tm-accent-ring)"
          : open
          ? `1px solid ${cfg.color}`
          : "1px solid var(--tm-border-soft)",
        borderLeft: highlighted ? "2px solid var(--tm-accent)" : undefined,
        transition: "all var(--tm-dur) var(--tm-ease)",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: cfg.color,
          flexShrink: 0,
          boxShadow: `0 0 6px ${cfg.color}`,
        }} />
        <span style={{ flex: 1, fontSize: "var(--tm-fs-meta)", fontWeight: 500, color: "var(--tm-text)" }}>
          {skill.display_name}
        </span>
        <span style={{
          fontSize: 10, padding: "2px 8px", borderRadius: 999,
          background: cfg.bg, color: cfg.color,
          border: `1px solid ${cfg.color}`,
          opacity: 0.9,
        }}>
          L{skill.level} · {cfg.label}
        </span>
      </div>

      {/* Level bar — uses accent (data viz, not status) */}
      <div style={{ height: 2, borderRadius: 999, background: "var(--tm-border-soft)", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 999,
          width: `${(skill.level / 5) * 100}%`,
          background: "linear-gradient(90deg, var(--tm-accent), var(--tm-accent-wash))",
          transition: `width ${0.8 + delay * 0.001}s var(--tm-ease)`,
        }} />
      </div>

      {open && skill.evidence_text && (
        <div style={{
          marginTop: 10, padding: "8px 12px",
          borderRadius: "var(--tm-radius-sm)",
          background: "var(--tm-accent-wash)",
          border: "1px solid var(--tm-accent-ring)",
          fontSize: 11, color: "var(--tm-text-muted)", lineHeight: 1.6,
        }}>
          {skill.evidence_text}
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
        <span style={{ fontSize: 9, color: "var(--tm-text-faint)" }}>{skills.length} skills</span>
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
  const [highlightedSkill] = useState<string | null>(null)

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload CV")
    } finally {
      setUploading(false)
    }
  }

  if (!ready) return null

  const hasCv = !!cvProfile?.cv_raw_text

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

  const counts = clusterEntries.reduce((acc, [, skills]) => {
    skills.forEach((s) => {
      if (s.level >= 4) acc.strong++
      else if (s.level >= 2) acc.gap++
      else acc.critical++
    })
    return acc
  }, { strong: 0, gap: 0, critical: 0 })

  return (
    <AppShell>
      <div className="tm-page-enter" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "24px 32px 16px", flexShrink: 0 }}>
          <div className="tm-label-caps" style={{ marginBottom: 6 }}>CV Skill Mapping</div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
            <div>
              <h1 className="tm-title" style={{ marginBottom: 3 }}>Your Skill Profile</h1>
              <p className="tm-meta">Extracted from CV · mapped against market</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => setShowUpload((v) => !v)}
                className="tm-btn tm-btn-ghost"
                style={{ height: 36, fontSize: "var(--tm-fs-meta)" }}
              >
                ↑ {hasCv ? "Replace CV" : "Upload CV"}
              </button>
            </div>
          </div>

          {/* Summary stats */}
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
            {[
              { label: "Strong",   count: counts.strong,   color: "var(--tm-success)", wash: "var(--tm-success-wash)" },
              { label: "Gaps",     count: counts.gap,       color: "var(--tm-warning)", wash: "var(--tm-warning-wash)" },
              { label: "Critical", count: counts.critical,  color: "var(--tm-danger)",  wash: "var(--tm-danger-wash)"  },
            ].map(({ label, count, color, wash }) => (
              <div key={label} style={{
                padding: "6px 14px", borderRadius: "var(--tm-radius-sm)",
                background: wash, border: `1px solid ${color}`,
                display: "flex", alignItems: "center", gap: 8,
                opacity: 0.9,
              }}>
                <span style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{count}</span>
                <span className="tm-meta">{label}</span>
              </div>
            ))}
            {scoreData && (
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                <span className="tm-meta">Truth Score:</span>
                <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: "var(--tm-fs-heading)", fontWeight: 600, color: "var(--tm-text)" }}>
                  {Math.round(scoreData.total_score)}
                </span>
                <span className="tm-meta">/100 · {totalSkills} skills</span>
              </div>
            )}
          </div>

          {/* Upload panel */}
          {(showUpload || !hasCv) && (
            <div style={{
              marginTop: 14, padding: 20,
              borderRadius: "var(--tm-radius)",
              background: "var(--tm-accent-wash)",
              border: "1px solid var(--tm-accent-ring)",
            }}>
              <StepCV onNext={handleUpload} />
              {uploading && (
                <p style={{ marginTop: 10, fontSize: "var(--tm-fs-meta)", color: "var(--tm-accent)" }}>
                  ⏳ Reading your CV and matching to market…
                </p>
              )}
              {message && (
                <p style={{ marginTop: 8, fontSize: "var(--tm-fs-meta)", color: "var(--tm-accent)" }}>{message}</p>
              )}
              {error && (
                <p style={{ marginTop: 8, fontSize: "var(--tm-fs-meta)", color: "var(--tm-danger)" }}>{error}</p>
              )}
            </div>
          )}
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
            {/* Category filter */}
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
            ) : clusterEntries.length === 0 ? (
              <div style={{ padding: "32px", textAlign: "center", color: "var(--tm-text-faint)", fontSize: "var(--tm-fs-meta)" }}>
                <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>◈</div>
                Upload a CV to see extracted skills
              </div>
            ) : (
              clusterEntries.map(([cluster, skills]) => (
                <ClusterSection
                  key={cluster}
                  cluster={cluster}
                  skills={skills}
                  highlighted={highlightedSkill}
                />
              ))
            )}
          </div>

          {/* RIGHT — CV text */}
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{
              padding: "14px 20px 10px",
              borderBottom: "1px solid var(--tm-border-soft)",
              display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
            }}>
              <div className="tm-label-caps">Your CV</div>
              {cvProfile?.cv_parsed_at && (
                <div style={{ fontSize: 10, color: "var(--tm-text-faint)", marginLeft: "auto" }}>
                  Parsed: {new Date(cvProfile.cv_parsed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </div>
              )}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 32px 20px", position: "relative" }}>
              {/* Watermark */}
              <div style={{
                position: "absolute", right: 24, top: 20,
                fontSize: 80, color: "var(--tm-accent-wash)",
                pointerEvents: "none", userSelect: "none", lineHeight: 1,
              }}>◈</div>

              {cvLoading ? (
                <p style={{ color: "var(--tm-text-faint)", fontSize: "var(--tm-fs-meta)" }}>Loading…</p>
              ) : hasCv ? (
                <pre style={{
                  fontSize: 11.5, lineHeight: 1.8, color: "var(--tm-text-muted)",
                  fontFamily: "var(--tm-font-mono)", whiteSpace: "pre-wrap",
                  wordBreak: "break-word", position: "relative",
                }}>
                  {cvProfile.cv_raw_text!.split("\n").map((line, i) => {
                    const isHighlighted = highlightedSkill && line.toLowerCase().includes(highlightedSkill.toLowerCase().split(" ")[0])
                    return (
                      <span key={i} style={{
                        display: "block",
                        background: isHighlighted ? "var(--tm-accent-wash)" : "transparent",
                        borderLeft: isHighlighted ? "2px solid var(--tm-accent)" : "2px solid transparent",
                        paddingLeft: 6,
                        borderRadius: 2,
                        transition: "all var(--tm-dur)",
                        color: line.startsWith("─") ? "var(--tm-accent-wash)"
                          : (line.match(/^[A-Z ]+$/) && line.length > 3) ? "var(--tm-text)"
                          : "var(--tm-text-muted)",
                        fontWeight: (line.match(/^[A-Z ]+$/) && line.length > 3) ? 600 : 400,
                      }}>
                        {line || "\u00A0"}
                      </span>
                    )
                  })}
                </pre>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--tm-text-faint)", textAlign: "center", gap: 12 }}>
                  <div style={{ fontSize: 48, opacity: 0.2 }}>◈</div>
                  <p style={{ fontSize: "var(--tm-fs-meta)" }}>No CV uploaded yet.</p>
                  <p style={{ fontSize: 11 }}>Use the button above to upload.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
