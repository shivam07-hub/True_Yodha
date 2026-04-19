"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/lib/hooks/use-auth"
import { scores, users } from "@/lib/api"
import type { GapSkill } from "@/lib/api"
import { AppShell } from "@/components/app-shell"
import { DomainRadar } from "@/components/dashboard/domain-radar"
import { SkillGraphPreview } from "@/components/skill-graph-preview"

const CAT_COLOR: Record<string, string> = {
  technical: "#00F5D4",
  domain:    "#FFB347",
  soft:      "#A97FFF",
}

function GapCard({ skill, rank }: { skill: GapSkill; rank: number }) {
  const [open, setOpen] = useState(false)
  const color = CAT_COLOR["technical"] // API doesn't provide cat — default teal
  const gap = Math.round(skill.gap_score)

  return (
    <div
      onClick={() => setOpen((o) => !o)}
      style={{
        borderRadius: 10,
        background: "rgba(255,255,255,0.03)",
        border: open ? `1px solid ${color}40` : "1px solid rgba(255,255,255,0.06)",
        padding: "14px 16px",
        transition: "all 0.25s",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          background: `${color}18`, border: `1px solid ${color}35`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 700, color, flexShrink: 0,
        }}>
          {rank}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#F0F4FF" }}>{skill.skill}</span>
            <span style={{ fontSize: 10, color, flexShrink: 0 }}>Gap: {gap}%</span>
          </div>
          <div style={{ height: 3, borderRadius: 999, background: "rgba(255,255,255,0.07)", overflow: "hidden", position: "relative" }}>
            <div style={{
              height: "100%", borderRadius: 999, width: `${gap}%`,
              background: `linear-gradient(90deg, ${color}, ${color}88)`,
              transition: "width 1.1s cubic-bezier(0.16,1,0.3,1)",
              position: "relative",
            }} />
          </div>
        </div>
        <div style={{ fontSize: 10, color: "rgba(240,244,255,0.3)", flexShrink: 0 }}>
          {skill.job_count_30d.toLocaleString()}j
        </div>
        <div style={{ fontSize: 12, color: "rgba(240,244,255,0.3)", transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none" }}>▾</div>
      </div>

      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {skill.why_it_matters && (
            <p style={{ fontSize: 11, color: "rgba(240,244,255,0.55)", lineHeight: 1.6, marginBottom: 8 }}>
              {skill.why_it_matters}
            </p>
          )}
          <div style={{ display: "flex", gap: 12, fontSize: 11, color }}>
            <span>Current: L{skill.current_level}</span>
            <span>Target: L{skill.target_level}</span>
            <span>{skill.job_count_30d.toLocaleString()} jobs / 30d</span>
          </div>
          <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: `${color}0d`, border: `1px solid ${color}25`, fontSize: 11, color }}>
            ⏱ Close this gap: L{skill.current_level} → L{skill.target_level}
          </div>
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { token, ready } = useAuth()

  const { data: scoreData, isLoading: scoreLoading } = useQuery({
    queryKey: ["scores", token],
    queryFn: () => scores.me(token!),
    enabled: !!token,
  })

  const { data: skillsData } = useQuery({
    queryKey: ["user-skills", token],
    queryFn: () => users.mySkills(token!),
    enabled: !!token,
  })

  if (!ready) return null

  return (
    <AppShell>
      <div style={{ padding: "28px 32px", overflowY: "auto", height: "100%" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, color: "rgba(0,245,212,0.7)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
            Overview Analytics
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: "#F0F4FF", letterSpacing: "-0.02em", marginBottom: 4 }}>
            Dashboard
          </h1>
          <p style={{ fontSize: 13, color: "rgba(240,244,255,0.45)" }}>
            {scoreData
              ? `Truth Score: ${Math.round(scoreData.total_score)}/100 · ${scoreData.skills_assessed} skills assessed`
              : "Upload your CV to see your Truth Score"}
          </p>
        </div>

        {/* Top grid: Radar + Skill Graph */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

          {/* Domain Radar */}
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(0,245,212,0.1)",
            borderRadius: 14,
            padding: "20px 20px 16px",
            backdropFilter: "blur(20px)",
          }}>
            <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(0,245,212,0.6)", marginBottom: 4 }}>
              Domain Breakdown
            </div>
            <div style={{ fontSize: 11, color: "rgba(240,244,255,0.35)", marginBottom: 12 }}>
              Tap a domain to see skills
            </div>
            {scoreData ? (
              <DomainRadar
                domainScores={scoreData.domain_scores}
                skillsByDomain={skillsData?.by_domain}
              />
            ) : scoreLoading ? (
              <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(240,244,255,0.25)", fontSize: 13 }}>
                Loading…
              </div>
            ) : (
              <div style={{ height: 280, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "rgba(240,244,255,0.25)", fontSize: 13, gap: 8 }}>
                <div style={{ fontSize: 32, opacity: 0.4 }}>▣</div>
                Upload a CV to see domain scores
              </div>
            )}
          </div>

          {/* Skill Graph */}
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(0,245,212,0.1)",
            borderRadius: 14,
            padding: "20px 16px 16px",
            backdropFilter: "blur(20px)",
          }}>
            <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(0,245,212,0.6)", marginBottom: 4 }}>
              Skill Intelligence Graph
            </div>
            <div style={{ fontSize: 11, color: "rgba(240,244,255,0.35)", marginBottom: 10 }}>
              Your skills vs market gaps
            </div>
            <SkillGraphPreview />
          </div>
        </div>

        {/* Gap Skills */}
        <div style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(0,245,212,0.08)",
          borderRadius: 14,
          padding: "20px",
          backdropFilter: "blur(20px)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(0,245,212,0.6)", marginBottom: 4 }}>
                Top Skills to Upgrade
              </div>
              <div style={{ fontSize: 12, color: "rgba(240,244,255,0.35)" }}>Click any card to see details</div>
            </div>
            {scoreData?.gap_skills.length ? (
              <div style={{ fontSize: 11, color: "rgba(240,244,255,0.3)", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#7B2FFF", display: "inline-block", boxShadow: "0 0 6px #7B2FFF" }} />
                {scoreData.gap_skills.length} gaps identified
              </div>
            ) : null}
          </div>

          {scoreLoading ? (
            <div style={{ color: "rgba(240,244,255,0.3)", fontSize: 13, padding: "24px 0", textAlign: "center" }}>
              Computing skill gaps…
            </div>
          ) : scoreData?.gap_skills.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {scoreData.gap_skills.slice(0, 6).map((skill, i) => (
                <GapCard key={skill.skill} skill={skill} rank={i + 1} />
              ))}
            </div>
          ) : (
            <div style={{ padding: "32px", textAlign: "center", color: "rgba(240,244,255,0.3)", fontSize: 13 }}>
              No skill gaps identified yet. Upload your CV to get started.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
