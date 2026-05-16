"use client"

import Link from "next/link"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { ParticleLoading } from "@/components/ui/particle-loading"
import { DomainRadar as SkillsDomainRadar } from "@/components/skills/domain-radar"
import { SkillCard } from "@/components/skills/skill-card"
import { ScoreRing } from "@/components/skills/score-ring"
import { WeaknessSpotlight } from "@/components/skills/weakness-spotlight"
import type { WeakDomain } from "@/components/skills/weakness-spotlight"
import { scores, users } from "@/lib/api"
import type { UserSkillsByDomain } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"

const EMPTY_SKILLS: UserSkillsByDomain = { by_domain: {}, by_cluster: {} }

export default function SkillsPage() {
  const { token, ready } = useAuth()
  const [activeDomain, setActiveDomain] = useState<string | null>(null)

  const { data: scoreData } = useQuery({
    queryKey: dataKeys.scores(),
    queryFn: () => scores.me(token!),
    enabled: !!token,
    retry: false,
  })

  const { data: userSkills, isLoading: skillsLoading } = useQuery({
    queryKey: dataKeys.userSkills(),
    queryFn: () => users.mySkills(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })

  if (!ready) return null

  const totalScore = scoreData ? Math.round(scoreData.total_score) : null
  const skills = userSkills ?? EMPTY_SKILLS
  const allSkills = Object.values(skills.by_domain).flat()
  const totalSkills = allSkills.length
  const proofCount = allSkills.filter(s => s.evidence_text).length
  const weakDomainCount = Object.entries(skills.by_domain).filter(([, items]) => {
    if (!items.length) return false
    const avg = items.reduce((s, it) => s + it.level, 0) / items.length
    return (avg / 5) * 100 < 40
  }).length

  const activeDomainSkills = activeDomain ? (skills.by_domain[activeDomain] ?? []) : []

  const weakestDomain: WeakDomain | null = (() => {
    const entries = Object.entries(skills.by_domain)
      .filter(([, items]) => items.length > 0)
      .map(([domain, items]) => ({
        domain,
        avg: Math.round(items.reduce((s, it) => s + it.level, 0) / items.length * 20),
        skillCount: items.length,
        noProofCount: items.filter(s => !s.evidence_text).length,
        maxLevel: Math.max(...items.map(s => s.level)),
      }))
      .filter(d => d.avg < 60)
      .sort((a, b) => a.avg !== b.avg ? a.avg - b.avg : b.skillCount - a.skillCount)
    return entries[0] ?? null
  })()

  return (
    <AppShell>
      <div className="tm-page-enter" style={{ minHeight: "100vh", padding: "var(--tm-page-py) var(--tm-page-px)", position: "relative" }}>

        {/* Skill intelligence overview */}
        <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", position: "relative", zIndex: 1 }}>
          <div>
            <div className="tm-label-caps" style={{ marginBottom: 6 }}>Skill Intelligence Overview</div>
            <h1 className="tm-title text-balance" style={{ marginBottom: 4 }}>Skill Intelligence</h1>
            <p className="tm-meta text-pretty">
              {scoreData
                ? `${totalSkills} skills · ${totalSkills - proofCount} need proof · ${weakDomainCount} domain${weakDomainCount === 1 ? "" : "s"} below 40%`
                : "Upload your CV to see your Myro Score"}
            </p>
          </div>

          {/* Hero Myro Score */}
          {totalScore !== null && <ScoreRing score={totalScore} />}
        </div>


        {/* Weakness Spotlight */}
        {weakestDomain && token && (
          <WeaknessSpotlight weakest={weakestDomain} token={token} />
        )}

        {/*
          DEACTIVATED — Skill Tree / Domain Radar toggle.

          Skill Tree (SkillNodeMap / force-directed graph) is a duplicate
          representation of Domain Radar with lower information quality.
          It adds significant JS weight and blocks mobile load.

          Re-activate when we have a clear idea of what the Skill Tree
          should uniquely communicate that Domain Radar does not — e.g.
          skill clustering by co-occurrence, career path arcs, or forge
          session progression trails. Until then: radar only.

          <div className="tm-segment-toggle">
            <button aria-pressed={view === "tree"} onClick={() => setView("tree")}>⬡ Skill Tree</button>
            <button aria-pressed={view === "radar"} onClick={() => setView("radar")}>◈ Domain Radar</button>
          </div>
        */}

        {/* Domain strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 20, position: "relative", zIndex: 1 }}>
          {Object.entries(skills.by_domain).map(([domain, items]) => {
            const avg = items.length > 0 ? Math.round(items.reduce((s, it) => s + it.level, 0) / items.length * 20) : 0
            const isActive = activeDomain === domain
            const strengthColor = avg >= 70 ? "var(--tm-success)" : avg >= 50 ? "#d97706" : avg >= 30 ? "var(--tm-warning)" : "var(--tm-danger)"
            const softBorder = `1px solid ${isActive ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`
            return (
              <button key={domain} onClick={() => setActiveDomain(isActive ? null : domain)}
                style={{
                  padding: "10px 14px", borderRadius: "var(--tm-radius-sm)", cursor: "pointer",
                  background: isActive ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.02)",
                  borderTop: softBorder, borderRight: softBorder, borderBottom: softBorder,
                  borderLeft: `3px solid ${isActive ? "var(--tm-accent)" : strengthColor}`,
                  textAlign: "left", fontFamily: "inherit",
                  transition: "all 200ms var(--tm-ease)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: isActive ? "var(--tm-accent)" : "var(--tm-text)", marginBottom: 4, lineHeight: 1.3 }}>{domain}</div>
                <div style={{ fontSize: 10, color: "var(--tm-text-faint)" }}>{items.length} skills · <span style={{ color: strengthColor, fontWeight: 600 }}>{avg}%</span></div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                  <span style={{ fontSize: 9, letterSpacing: "0.06em", color: isActive ? "var(--tm-accent)" : "var(--tm-text-faint)" }}>
                    {isActive ? "← close" : "Explore →"}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {/*
          Radar card — two-panel layout: [SVG radar | right panel].
          Right panel has two states:
            · Default: Domain Scores list (overview)
            · activeDomain set: Domain Detail with SkillCards + actions
          No page growth on domain select — the panel swaps in place.
        */}
        <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-lg)", overflow: "hidden", position: "relative", zIndex: 1 }}>
          {skillsLoading ? (
            <ParticleLoading message="Loading your skill constellation…" height={560} />
          ) : totalSkills === 0 ? (
            <div style={{ height: 400, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
              <div style={{ fontSize: 40 }}>⬡</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)" }}>No skills mapped yet</div>
              <div style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>Upload your CV to generate your personal skill constellation</div>
              <Button variant="solid" size="lg" render={<Link href="/cv" />}>
                Upload CV
              </Button>
            </div>
          ) : (
            <div style={{ padding: "28px 32px", display: "flex", gap: 32, alignItems: "flex-start", flexWrap: "wrap" }}>
              {/* Left — SVG radar (SVG-only, no right panel inside) */}
              <SkillsDomainRadar
                userSkills={skills}
                onDomainClick={d => setActiveDomain(a => a === d ? null : d)}
                activeDomain={activeDomain}
              />

              {/* Right panel — swaps between Domain Scores and Domain Detail */}
              <div style={{ flex: 1, minWidth: 200 }}>
                {activeDomain && activeDomainSkills.length > 0 ? (
                  /* Domain Detail */
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                      <div>
                        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-accent)", marginBottom: 4 }}>Domain Inspector</div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--tm-text)", marginBottom: 6 }}>{activeDomain}</div>
                        <div style={{ display: "flex", gap: 10, fontSize: 10, color: "var(--tm-text-faint)", flexWrap: "wrap" }}>
                          <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--tm-success)", marginRight: 4 }} />L3+ strong</span>
                          <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--tm-warning)", marginRight: 4 }} />L2 building</span>
                          <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--tm-danger)", marginRight: 4 }} />L0–1 early</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setActiveDomain(null)}
                        style={{ background: "none", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-sm)", color: "var(--tm-text-faint)", cursor: "pointer", padding: "4px 10px", fontSize: 11, fontFamily: "inherit", flexShrink: 0 }}
                      >
                        ✕
                      </button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 340, overflowY: "auto" }}>
                      {activeDomainSkills.map(skill => (
                        <SkillCard key={skill.key} skill={skill} token={token!} />
                      ))}
                    </div>
                  </div>
                ) : (
                  /* Domain Scores — default overview */
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 4 }}>
                      Domain Scores
                    </div>
                    {Object.entries(skills.by_domain).map(([domain, items]) => {
                      const pct = items.length ? Math.round(items.reduce((s, it) => s + it.level, 0) / items.length * 20) : 0
                      const barColor = pct >= 70 ? "var(--tm-success)" : pct >= 40 ? "var(--tm-warning)" : "var(--tm-danger)"
                      return (
                        <div key={domain} onClick={() => setActiveDomain(domain)} style={{ cursor: "pointer" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontSize: 13, color: "var(--tm-text-muted)" }}>{domain}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: barColor }}>{pct}%</span>
                          </div>
                          <div style={{ height: 3, borderRadius: 99, background: "var(--tm-border)", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: barColor, transition: "width 600ms var(--tm-ease)" }} />
                          </div>
                        </div>
                      )
                    })}
                    <div style={{ marginTop: 8, fontSize: 11, color: "var(--tm-text-faint)", fontStyle: "italic" }}>
                      Click a domain to explore its skills →
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

      </div>
    </AppShell>
  )
}
