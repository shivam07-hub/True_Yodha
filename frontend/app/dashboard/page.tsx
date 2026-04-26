"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/lib/hooks/use-auth"
import { scores, users } from "@/lib/api"
import { dataKeys, invalidateScoreData } from "@/lib/domain-data"
import { AppShell } from "@/components/app-shell"
import { DomainRadar } from "@/components/dashboard/domain-radar"
import { SkillGraphPreview } from "@/components/skill-graph-preview"
import { CVRequiredNudge } from "@/components/common/cv-required-nudge"


export default function DashboardPage() {
  const { token, ready } = useAuth()
  const queryClient = useQueryClient()

  const { data: scoreData, isLoading: scoreLoading } = useQuery({
    queryKey: dataKeys.scores(token),
    queryFn: () => scores.me(token!),
    enabled: !!token,
    retry: false,
  })

  const recompute = useMutation({
    mutationFn: () => scores.compute(token!),
    onSuccess: () => invalidateScoreData(queryClient, token),
  })

  const { data: skillsData } = useQuery({
    queryKey: dataKeys.userSkills(token),
    queryFn: () => users.mySkills(token!),
    enabled: !!token,
  })

  if (!ready) return null

  const totalScore = scoreData ? Math.round(scoreData.total_score) : null
  const hasCv = !scoreLoading && !!scoreData

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
                : "Upload your CV to see your Myro Score"}
            </p>
          </div>

          {/* Hero Myro Score */}
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
              <div className="tm-label-caps">Myro Score</div>
            </div>
          )}
        </div>

        {/* Top grid: Radar + Skill Graph — or nudge when no CV */}
        {hasCv ? (
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
              ) : (
                <div style={{ height: 280, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
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
                    {recompute.isError ? "Retry" : "Compute Scores"}
                  </button>
                </div>
              )}
            </div>

            <div className="tm-card" style={{ backdropFilter: "blur(20px)" }}>
              <div className="tm-label-caps" style={{ marginBottom: 4 }}>Skill Intelligence Graph</div>
              <div className="tm-meta" style={{ marginBottom: 10 }}>Your skills vs market gaps</div>
              <SkillGraphPreview />
            </div>
          </div>
        ) : !scoreLoading ? (
          <div style={{ marginBottom: 16, position: "relative", zIndex: 1 }}>
            <CVRequiredNudge variant="block" hasCv={hasCv} feature="your Myro Score" />
          </div>
        ) : null}

      </div>
    </AppShell>
  )
}
