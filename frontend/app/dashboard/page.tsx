"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/lib/hooks/use-auth"
import { scores, users } from "@/lib/api"
import type { GapSkill } from "@/lib/api"
import { AppShell } from "@/components/app-shell"
import { DomainRadar } from "@/components/dashboard/domain-radar"
import { SkillGraphPreview } from "@/components/skill-graph-preview"

function GapCard({ skill, rank }: { skill: GapSkill; rank: number }) {
  const [open, setOpen] = useState(false)
  const gap = Math.round(skill.gap_score)

  return (
    <div
      onClick={() => setOpen((o) => !o)}
      style={{
        borderRadius: "var(--tm-radius)",
        background: open ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.02)",
        border: open ? "1px solid var(--tm-accent-ring)" : "1px solid var(--tm-border-soft)",
        padding: "14px 16px",
        transition: "all var(--tm-dur) var(--tm-ease)",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 24, height: 24, borderRadius: "var(--tm-radius-sm)",
          background: "var(--tm-accent-wash)",
          border: "1px solid var(--tm-accent-ring)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 700, color: "var(--tm-accent)", flexShrink: 0,
        }}>
          {rank}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: "var(--tm-fs-meta)", fontWeight: 500, color: "var(--tm-text)" }}>{skill.skill}</span>
            <span style={{ fontSize: 10, color: "var(--tm-accent)", flexShrink: 0 }}>Gap: {gap}%</span>
          </div>
          <div style={{ height: 2, borderRadius: 999, background: "var(--tm-border-soft)", overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 999, width: `${gap}%`,
              background: "linear-gradient(90deg, var(--tm-accent), var(--tm-accent-wash))",
              transition: "width 1.1s var(--tm-ease)",
            }} />
          </div>
        </div>
        <div style={{ fontSize: 10, color: "var(--tm-text-faint)", flexShrink: 0 }}>
          {skill.job_count_30d.toLocaleString()}j
        </div>
        <div style={{
          fontSize: 12, color: "var(--tm-text-faint)",
          transition: `transform var(--tm-dur)`,
          transform: open ? "rotate(180deg)" : "none",
        }}>▾</div>
      </div>

      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--tm-border-soft)" }}>
          {skill.why_it_matters && (
            <p style={{ fontSize: 11, color: "var(--tm-text-muted)", lineHeight: 1.6, marginBottom: 8 }}>
              {skill.why_it_matters}
            </p>
          )}
          <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--tm-accent)" }}>
            <span>Current: L{skill.current_level}</span>
            <span>Target: L{skill.target_level}</span>
            <span>{skill.job_count_30d.toLocaleString()} jobs / 30d</span>
          </div>
          <div style={{
            marginTop: 10, padding: "8px 12px",
            borderRadius: "var(--tm-radius-sm)",
            background: "var(--tm-accent-wash)",
            border: "1px solid var(--tm-accent-ring)",
            fontSize: 11, color: "var(--tm-accent)",
          }}>
            ⏱ Close this gap: L{skill.current_level} → L{skill.target_level}
          </div>
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { token, ready } = useAuth()
  const queryClient = useQueryClient()

  const { data: scoreData, isLoading: scoreLoading, isError: scoreError } = useQuery({
    queryKey: ["scores", token],
    queryFn: () => scores.me(token!),
    enabled: !!token,
    retry: false,
  })

  const recompute = useMutation({
    mutationFn: () => scores.compute(token!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scores", token] }),
  })

  const { data: skillsData } = useQuery({
    queryKey: ["user-skills", token],
    queryFn: () => users.mySkills(token!),
    enabled: !!token,
  })

  if (!ready) return null

  const totalScore = scoreData ? Math.round(scoreData.total_score) : null

  return (
    <AppShell>
      <div className="tm-page-enter" style={{ padding: "28px 32px", overflowY: "auto", height: "100%", position: "relative" }}>

        {/* Accent glow header atmosphere */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 220,
          background: "radial-gradient(ellipse at 60% 0%, var(--tm-accent-wash) 0%, transparent 70%)",
          pointerEvents: "none", zIndex: 0,
        }} />

        {/* Header */}
        <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-start", justifyContent: "space-between", position: "relative", zIndex: 1 }}>
          <div>
            <div className="tm-label-caps" style={{ marginBottom: 6 }}>Overview Analytics</div>
            <h1 className="tm-title" style={{ marginBottom: 4 }}>Dashboard</h1>
            <p className="tm-meta">
              {scoreData
                ? `${scoreData.skills_assessed} skills assessed · ${scoreData.gap_skills.length} gaps identified`
                : "Upload your CV to see your Truth Score"}
            </p>
          </div>

          {/* Hero Truth Score */}
          {totalScore !== null && (
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{
                fontFamily: "var(--tm-font-mono)",
                fontSize: "var(--tm-fs-display)",
                fontWeight: 600,
                color: "var(--tm-text)",
                letterSpacing: "var(--tm-tracking-tight)",
                lineHeight: "var(--tm-lh-display)",
              }}>
                {totalScore}
                <span style={{
                  fontSize: "var(--tm-fs-body)",
                  color: "var(--tm-text-faint)",
                  fontFamily: "var(--tm-font-sans)",
                }}> /100</span>
              </div>
              <div className="tm-label-caps">Truth Score</div>
            </div>
          )}
        </div>

        {/* Top grid: Radar + Skill Graph */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16, position: "relative", zIndex: 1 }}>

          <div className="tm-card" style={{ backdropFilter: "blur(20px)" }}>
            <div className="tm-label-caps" style={{ marginBottom: 4 }}>Domain Breakdown</div>
            <div className="tm-meta" style={{ marginBottom: 12 }}>Tap a domain to see skills</div>
            {scoreData && Object.keys(scoreData.domain_scores).length > 0 ? (
              <DomainRadar
                domainScores={scoreData.domain_scores}
                skillsByDomain={skillsData?.by_domain}
              />
            ) : scoreLoading || recompute.isPending ? (
              <div style={{ height: 280, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  border: "2px solid var(--tm-border-soft)",
                  borderTopColor: "var(--tm-accent)",
                  animation: "spin 0.9s linear infinite",
                }} />
                <span style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-faint)" }}>
                  {recompute.isPending ? "Computing scores…" : "Loading…"}
                </span>
              </div>
            ) : scoreError || (scoreData && Object.keys(scoreData.domain_scores).length === 0) ? (
              <div style={{ height: 280, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: "var(--tm-radius)",
                  background: "var(--tm-accent-wash)",
                  border: "1px solid var(--tm-accent-ring)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20,
                }}>◈</div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-muted)", marginBottom: 4 }}>
                    {recompute.isError ? "Computation failed — try again" : "Scores not yet computed"}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>
                    Your CV has been processed
                  </p>
                </div>
                <button
                  onClick={() => recompute.mutate()}
                  style={{
                    padding: "7px 18px",
                    borderRadius: "var(--tm-radius-sm)",
                    background: "var(--tm-accent-wash)",
                    border: "1px solid var(--tm-accent-ring)",
                    color: "var(--tm-accent)",
                    fontSize: 12, fontWeight: 500, cursor: "pointer",
                    transition: "all var(--tm-dur) var(--tm-ease)",
                  }}
                >
                  Compute Scores
                </button>
              </div>
            ) : (
              <div style={{ height: 280, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <div style={{ fontSize: 28, opacity: 0.2 }}>▣</div>
                <p style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-faint)" }}>
                  Upload a CV to see domain scores
                </p>
              </div>
            )}
          </div>

          <div className="tm-card" style={{ backdropFilter: "blur(20px)" }}>
            <div className="tm-label-caps" style={{ marginBottom: 4 }}>Skill Intelligence Graph</div>
            <div className="tm-meta" style={{ marginBottom: 10 }}>Your skills vs market gaps</div>
            <SkillGraphPreview />
          </div>
        </div>

        {/* Gap Skills */}
        <div className="tm-card" style={{ backdropFilter: "blur(20px)", position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div className="tm-label-caps" style={{ marginBottom: 4 }}>Top Skills to Upgrade</div>
              <div className="tm-meta">Click any card to see details</div>
            </div>
            {scoreData?.gap_skills.length ? (
              <div style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-faint)", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "var(--tm-accent)",
                  display: "inline-block",
                  boxShadow: "0 0 6px var(--tm-accent-glow)",
                }} />
                {scoreData.gap_skills.length} gaps identified
              </div>
            ) : null}
          </div>

          {scoreLoading ? (
            <div style={{ color: "var(--tm-text-faint)", fontSize: "var(--tm-fs-meta)", padding: "24px 0", textAlign: "center" }}>
              Computing skill gaps…
            </div>
          ) : scoreData?.gap_skills.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {scoreData.gap_skills.slice(0, 6).map((skill, i) => (
                <GapCard key={skill.skill} skill={skill} rank={i + 1} />
              ))}
            </div>
          ) : (
            <div style={{ padding: "32px", textAlign: "center", color: "var(--tm-text-faint)", fontSize: "var(--tm-fs-meta)" }}>
              No skill gaps identified yet. Upload your CV to get started.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
