"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/lib/hooks/use-auth"
import { scores, users } from "@/lib/api"
import { AppShell } from "@/components/app-shell"
import { DomainRadar } from "@/components/dashboard/domain-radar"
import { SkillGraphPreview } from "@/components/skill-graph-preview"


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
            <div className="tm-label-caps" style={{ marginBottom: 12 }}>Domain Breakdown</div>
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
              (() => {
                const hasCV = Object.keys(skillsData?.by_domain ?? {}).length > 0
                return (
                  <div style={{ height: 280, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: "var(--tm-radius)",
                      background: "var(--tm-accent-wash)",
                      border: "1px solid var(--tm-accent-ring)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 21,
                    }}>{hasCV ? "◈" : "⬆"}</div>
                    <div style={{ textAlign: "center" }}>
                      <p style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-muted)", marginBottom: 4 }}>
                        {hasCV
                          ? (recompute.isError ? "Computation failed — try again" : "Scores not yet computed")
                          : "No CV uploaded yet"}
                      </p>
                      {hasCV && (
                        <p style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>
                          Your CV has been processed
                        </p>
                      )}
                    </div>
                    {hasCV ? (
                      <button
                        onClick={() => recompute.mutate()}
                        style={{
                          padding: "7px 18px",
                          borderRadius: "var(--tm-radius-sm)",
                          background: "var(--tm-accent-wash)",
                          border: "1px solid var(--tm-accent-ring)",
                          color: "var(--tm-accent)",
                          fontSize: 13, fontWeight: 500, cursor: "pointer",
                          transition: "all var(--tm-dur) var(--tm-ease)",
                        }}
                      >
                        Compute Scores
                      </button>
                    ) : (
                      <a
                        href="/cv"
                        style={{
                          padding: "7px 18px",
                          borderRadius: "var(--tm-radius-sm)",
                          background: "var(--tm-accent-wash)",
                          border: "1px solid var(--tm-accent-ring)",
                          color: "var(--tm-accent)",
                          fontSize: 13, fontWeight: 500, cursor: "pointer",
                          textDecoration: "none",
                          transition: "all var(--tm-dur) var(--tm-ease)",
                        }}
                      >
                        Upload CV →
                      </a>
                    )}
                  </div>
                )
              })()
            ) : (
              <div style={{ height: 280, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <div style={{ fontSize: 29, opacity: 0.2 }}>▣</div>
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

      </div>
    </AppShell>
  )
}
