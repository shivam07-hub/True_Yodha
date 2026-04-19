"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AppShell } from "@/components/app-shell"
import { StepCV } from "@/components/onboarding/step-cv"
import { jobs, scores, uploadCV, cv, users } from "@/lib/api"
import type { UserSkillItem } from "@/lib/api"
import { useAuth } from "@/lib/hooks/use-auth"

const STATUS_CONFIG = {
  strong:  { color: "#00F5D4", label: "Strong",   bg: "rgba(0,245,212,0.08)"  },
  exceeds: { color: "#00F5D4", label: "Exceeds",  bg: "rgba(0,245,212,0.12)"  },
  close:   { color: "#FFB347", label: "Close",    bg: "rgba(255,179,71,0.1)"  },
  gap:     { color: "#FFB347", label: "Gap",      bg: "rgba(255,179,71,0.08)" },
  missing: { color: "#A97FFF", label: "Missing",  bg: "rgba(123,47,255,0.1)"  },
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
        borderRadius: 10,
        padding: "12px 14px",
        background: highlighted ? "rgba(0,245,212,0.06)" : open ? cfg.bg : "rgba(255,255,255,0.02)",
        border: highlighted ? "1px solid rgba(0,245,212,0.3)" : open ? `1px solid ${cfg.color}30` : "1px solid rgba(255,255,255,0.06)",
        transition: "all 0.25s",
        cursor: "pointer",
        borderLeft: highlighted ? "2px solid #00F5D4" : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00F5D4", flexShrink: 0, boxShadow: "0 0 6px rgba(0,245,212,0.8)" }} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#F0F4FF" }}>{skill.display_name}</span>
        <span style={{
          fontSize: 10, padding: "2px 8px", borderRadius: 999,
          background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}25`,
        }}>
          L{skill.level} · {cfg.label}
        </span>
      </div>

      {/* Level bar */}
      <div style={{ height: 3, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 999, width: `${(skill.level / 5) * 100}%`,
          background: `linear-gradient(90deg, #00F5D4, rgba(0,245,212,0.5))`,
          transition: `width ${0.8 + delay * 0.001}s cubic-bezier(0.16,1,0.3,1)`,
        }} />
      </div>

      {open && skill.evidence_text && (
        <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(0,245,212,0.05)", border: "1px solid rgba(0,245,212,0.15)", fontSize: 11, color: "rgba(240,244,255,0.65)", lineHeight: 1.6 }}>
          {skill.evidence_text}
        </div>
      )}
    </div>
  )
}

function ClusterSection({ cluster, skills, highlighted }: { cluster: string; skills: UserSkillItem[]; highlighted: string | null }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(0,245,212,0.6)", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
        <span>{cluster}</span>
        <span style={{ fontSize: 9, color: "rgba(240,244,255,0.25)" }}>{skills.length} skills</span>
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
  const [catFilter, setCatFilter] = useState("all")
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
  const clusterEntries = Object.entries(skillsData?.by_cluster ?? {}).sort(([, a], [, b]) => b.length - a.length)
  const totalSkills = clusterEntries.reduce((n, [, s]) => n + s.length, 0)

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
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "24px 32px 16px", flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: "rgba(0,245,212,0.7)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
            CV Skill Mapping
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 600, color: "#F0F4FF", letterSpacing: "-0.02em", marginBottom: 3 }}>
                Your Skill Profile
              </h1>
              <p style={{ fontSize: 13, color: "rgba(240,244,255,0.45)" }}>
                Extracted from CV · mapped against market
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => setShowUpload((v) => !v)}
                style={{
                  padding: "8px 16px", borderRadius: 8,
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                  color: "rgba(240,244,255,0.6)", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                ↑ {hasCv ? "Replace CV" : "Upload CV"}
              </button>
            </div>
          </div>

          {/* Summary pills */}
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            {[
              { label: "Strong", count: counts.strong, color: "#00F5D4" },
              { label: "Gaps", count: counts.gap, color: "#FFB347" },
              { label: "Critical", count: counts.critical, color: "#A97FFF" },
            ].map(({ label, count, color }) => (
              <div key={label} style={{ padding: "6px 14px", borderRadius: 8, background: `${color}0d`, border: `1px solid ${color}20`, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{count}</span>
                <span style={{ fontSize: 11, color: "rgba(240,244,255,0.45)" }}>{label}</span>
              </div>
            ))}
            {scoreData && (
              <div style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 8, background: "rgba(123,47,255,0.07)", border: "1px solid rgba(123,47,255,0.18)", fontSize: 12, color: "rgba(240,244,255,0.5)" }}>
                Truth Score: <span style={{ color: "#00F5D4", fontWeight: 600 }}>{Math.round(scoreData.total_score)}</span>
                /100 · <span style={{ color: "#A97FFF" }}>{totalSkills} skills</span>
              </div>
            )}
          </div>

          {/* Upload panel */}
          {(showUpload || !hasCv) && (
            <div style={{ marginTop: 14, padding: 20, borderRadius: 12, background: "rgba(0,245,212,0.04)", border: "1px solid rgba(0,245,212,0.18)" }}>
              <StepCV onNext={handleUpload} />
              {uploading && (
                <p style={{ marginTop: 10, fontSize: 12, color: "rgba(0,245,212,0.7)" }}>
                  ⏳ Reading your CV and matching to market…
                </p>
              )}
              {message && <p style={{ marginTop: 8, fontSize: 12, color: "#00F5D4" }}>{message}</p>}
              {error && <p style={{ marginTop: 8, fontSize: 12, color: "#A97FFF" }}>{error}</p>}
            </div>
          )}
        </div>

        {/* Split body */}
        <div style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          overflow: "hidden",
          borderTop: "1px solid rgba(0,245,212,0.07)",
        }}>
          {/* LEFT — Skill mapping */}
          <div style={{ overflowY: "auto", padding: "16px 20px 24px 32px", borderRight: "1px solid rgba(0,245,212,0.07)" }}>
            {/* Category filter */}
            <div style={{ display: "flex", gap: 5, marginBottom: 14 }}>
              {["all", "by domain", "by cluster"].map((c) => (
                <button key={c} onClick={() => setCatFilter(c)} style={{
                  padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 500,
                  background: catFilter === c ? "rgba(0,245,212,0.12)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${catFilter === c ? "rgba(0,245,212,0.4)" : "rgba(255,255,255,0.08)"}`,
                  color: catFilter === c ? "#00F5D4" : "rgba(240,244,255,0.5)",
                  cursor: "pointer", textTransform: "capitalize", transition: "all 0.2s", fontFamily: "inherit",
                }}>{c}</button>
              ))}
            </div>

            {skillsLoading ? (
              <div style={{ color: "rgba(240,244,255,0.3)", fontSize: 13, padding: "32px 0", textAlign: "center" }}>
                Loading skills…
              </div>
            ) : clusterEntries.length === 0 ? (
              <div style={{ padding: "32px", textAlign: "center", color: "rgba(240,244,255,0.3)", fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>◈</div>
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
              borderBottom: "1px solid rgba(0,245,212,0.06)",
              display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
            }}>
              <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(0,245,212,0.5)" }}>Your CV</div>
              {cvProfile?.cv_parsed_at && (
                <div style={{ fontSize: 10, color: "rgba(240,244,255,0.25)", marginLeft: "auto" }}>
                  Parsed: {new Date(cvProfile.cv_parsed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </div>
              )}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 32px 20px", position: "relative" }}>
              {/* Watermark */}
              <div style={{ position: "absolute", right: 24, top: 20, fontSize: 80, color: "rgba(0,245,212,0.03)", pointerEvents: "none", userSelect: "none", lineHeight: 1 }}>◈</div>

              {cvLoading ? (
                <p style={{ color: "rgba(240,244,255,0.3)", fontSize: 13 }}>Loading…</p>
              ) : hasCv ? (
                <pre style={{
                  fontSize: 11.5, lineHeight: 1.8, color: "rgba(240,244,255,0.7)",
                  fontFamily: "var(--font-sans), monospace", whiteSpace: "pre-wrap",
                  wordBreak: "break-word", position: "relative",
                }}>
                  {cvProfile.cv_raw_text!.split("\n").map((line, i) => {
                    const isHighlighted = highlightedSkill && line.toLowerCase().includes(highlightedSkill.toLowerCase().split(" ")[0])
                    return (
                      <span key={i} style={{
                        display: "block",
                        background: isHighlighted ? "rgba(0,245,212,0.12)" : "transparent",
                        borderLeft: isHighlighted ? "2px solid #00F5D4" : "2px solid transparent",
                        paddingLeft: 6,
                        borderRadius: 2,
                        transition: "all 0.2s",
                        color: line.startsWith("─") ? "rgba(0,245,212,0.3)"
                          : (line.match(/^[A-Z ]+$/) && line.length > 3) ? "rgba(240,244,255,0.9)"
                          : "rgba(240,244,255,0.65)",
                        fontWeight: (line.match(/^[A-Z ]+$/) && line.length > 3) ? 600 : 400,
                      }}>
                        {line || "\u00A0"}
                      </span>
                    )
                  })}
                </pre>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "rgba(240,244,255,0.25)", textAlign: "center", gap: 12 }}>
                  <div style={{ fontSize: 48, opacity: 0.3 }}>◈</div>
                  <p style={{ fontSize: 13 }}>No CV uploaded yet.</p>
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
