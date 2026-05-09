"use client"

import Link from "next/link"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AppShell } from "@/components/app-shell"
import { OrganicSkillGraph } from "@/components/skills/organic-skill-graph"
import { DomainRadar as SkillsDomainRadar } from "@/components/skills/domain-radar"
import { CVRequiredNudge } from "@/components/common/cv-required-nudge"
import { scores, users } from "@/lib/api"
import type { UserSkillsByDomain } from "@/lib/api"
import { dataKeys, invalidateScoreData } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"

const EMPTY_SKILLS: UserSkillsByDomain = { by_domain: {}, by_cluster: {} }

export default function SkillsPage() {
  const { token, ready } = useAuth()
  const queryClient = useQueryClient()
  const [view, setView] = useState<"tree" | "radar">("tree")
  const [activeDomain, setActiveDomain] = useState<string | null>(null)

  const { data: scoreData, isLoading: scoreLoading } = useQuery({
    queryKey: dataKeys.scores(),
    queryFn: () => scores.me(token!),
    enabled: !!token,
    retry: false,
  })

  const recompute = useMutation({
    mutationFn: () => scores.compute(token!),
    onSuccess: () => invalidateScoreData(queryClient),
  })

  const { data: userSkills, isLoading: skillsLoading } = useQuery({
    queryKey: dataKeys.userSkills(),
    queryFn: () => users.mySkills(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })

  if (!ready) return null

  const totalScore = scoreData ? Math.round(scoreData.total_score) : null
  const hasCv = !scoreLoading && !!scoreData
  const skills = userSkills ?? EMPTY_SKILLS
  const totalSkills = Object.values(skills.by_domain).flat().length
  const levellingCount = Object.values(skills.by_domain).flat().filter(s => s.level > 0 && s.level < 5).length
  const proofCount = Object.values(skills.by_domain).flat().filter(s => s.evidence_text).length

  const activeDomainSkills = activeDomain ? (skills.by_domain[activeDomain] ?? []) : []
  const rankedDomains = scoreData
    ? Object.entries(scoreData.domain_scores).sort((a, b) => b[1] - a[1])
    : []
  const topDomains = rankedDomains.slice(0, 3)
  const focusDomains = [...rankedDomains].slice(-3).sort((a, b) => a[1] - b[1])

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
                fontVariantNumeric: "tabular-nums",
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

        {hasCv ? (
          <div style={{ marginBottom: 24, position: "relative", zIndex: 1 }}>
            <div className="tm-card">
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                <div>
                  <div className="tm-label-caps" style={{ marginBottom: 6 }}>Domain Highlights</div>
                  <p className="tm-meta text-pretty" style={{ margin: 0 }}>
                    Summary up top, detailed radar and drill-down in the visual explorer below.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setView("radar")}
                  style={{
                    padding: "7px 14px",
                    borderRadius: "var(--tm-radius-sm)",
                    background: "var(--tm-accent-wash)",
                    border: "1px solid var(--tm-accent-ring)",
                    color: "var(--tm-accent)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Open Domain Radar
                </button>
              </div>
              {scoreData && Object.keys(scoreData.domain_scores).length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
                  <div style={{ padding: "12px 14px", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-sm)", background: "rgba(255,255,255,0.01)" }}>
                    <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 10 }}>
                      Strongest Domains
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {topDomains.map(([domain, score]) => (
                        <div key={domain} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 13, color: "var(--tm-text)" }}>{domain}</span>
                          <span style={{ fontSize: 12, color: "var(--tm-success)", fontWeight: 700, fontFamily: "var(--tm-font-mono)", fontVariantNumeric: "tabular-nums" }}>
                            {Math.round(score)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding: "12px 14px", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-sm)", background: "rgba(255,255,255,0.01)" }}>
                    <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 10 }}>
                      Focus Next
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {focusDomains.map(([domain, score]) => (
                        <div key={domain} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 13, color: "var(--tm-text)" }}>{domain}</span>
                          <span style={{ fontSize: 12, color: "var(--tm-warning)", fontWeight: 700, fontFamily: "var(--tm-font-mono)", fontVariantNumeric: "tabular-nums" }}>
                            {Math.round(score)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
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
          </div>
        ) : !scoreLoading ? (
          <div style={{ marginBottom: 24, position: "relative", zIndex: 1 }}>
            <CVRequiredNudge variant="block" hasCv={hasCv} feature="your Myro Score" />
          </div>
        ) : null}

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12, position: "relative", zIndex: 1 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--tm-accent)", marginBottom: 6, opacity: 0.8 }}>
              VISUAL EXPLORER
            </div>
            <h1 className="text-balance" style={{ fontSize: "var(--tm-fs-title)", fontWeight: 700, color: "var(--tm-text)", letterSpacing: "var(--tm-tracking-tight)", margin: 0 }}>
              Skill Graph & Radar
            </h1>
            <p className="text-pretty" style={{ fontSize: 13, color: "var(--tm-text-faint)", marginTop: 4 }}>
              {totalSkills} skills · {proofCount} with proof · {levellingCount} actively levelling
            </p>
          </div>

          {/* View toggle */}
          <div className="tm-segment-toggle">
            <button aria-pressed={view === "tree"} onClick={() => setView("tree")}>⬡ Skill Tree</button>
            <button aria-pressed={view === "radar"} onClick={() => setView("radar")}>◈ Domain Radar</button>
          </div>
        </div>

        {/* Stats strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 20, position: "relative", zIndex: 1 }}>
          {Object.entries(skills.by_domain).map(([domain, items]) => {
            const avg = items.length > 0 ? Math.round(items.reduce((s, it) => s + it.level, 0) / items.length * 20) : 0
            const isActive = activeDomain === domain
            return (
              <button key={domain} title={domain} onClick={() => setActiveDomain(isActive ? null : domain)}
                style={{
                  padding: "10px 14px", borderRadius: "var(--tm-radius-sm)", cursor: "pointer",
                  background: isActive ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${isActive ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
                  textAlign: "left", fontFamily: "inherit",
                  transition: "all 200ms var(--tm-ease)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: isActive ? "var(--tm-accent)" : "var(--tm-text)", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{domain}</div>
                <div style={{ fontSize: 10, color: "var(--tm-text-faint)" }}>{items.length} skills · {avg}%</div>
                <div style={{ height: 2, background: "var(--tm-border)", borderRadius: 99, marginTop: 6, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${avg}%`, background: "var(--tm-accent)", borderRadius: 99, transition: "width 600ms var(--tm-ease)" }} />
                </div>
              </button>
            )
          })}
        </div>

        {/* Main visualization */}
        <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-lg)", overflow: "hidden", position: "relative", zIndex: 1 }}>
          {skillsLoading ? (
            <div style={{ height: 560, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--tm-text-faint)", fontSize: 14 }}>
              Loading your skill constellation…
            </div>
          ) : totalSkills === 0 ? (
            <div style={{ height: 400, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
              <div style={{ fontSize: 40 }}>⬡</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)" }}>No skills mapped yet</div>
              <div style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>Upload your CV to generate your personal skill constellation</div>
              <Link
                href="/cv"
                style={{
                  padding: "7px 14px",
                  borderRadius: "var(--tm-radius-sm)",
                  border: "1px solid var(--tm-accent-ring)",
                  color: "var(--tm-accent)",
                  textDecoration: "none",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Upload CV
              </Link>
            </div>
          ) : view === "tree" ? (
            <div style={{ padding: "18px 10px 10px", background: "var(--tm-surface-2)" }}>
              <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-text-faint)", padding: "0 14px 10px", display: "flex", gap: 20 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "var(--tm-accent)" }} />
                  Skills you have
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", border: "2px solid #5B9CFF" }} />
                  Skills to unlock
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ display: "inline-block", width: 16, height: 1.5, background: "rgba(91,156,255,0.75)", borderRadius: 99 }} />
                  Unlock path
                </span>
              </div>
              <OrganicSkillGraph userSkills={skills} gapSkills={scoreData?.gap_skills ?? []} />
            </div>
          ) : (
            <div style={{ padding: "28px 32px" }}>
              <SkillsDomainRadar userSkills={skills} onDomainClick={d => setActiveDomain(a => a === d ? null : d)} activeDomain={activeDomain} />
            </div>
          )}
        </div>

        {/* Domain drill-down */}
        {activeDomain && activeDomainSkills.length > 0 && (
          <div style={{ marginTop: 16, background: "var(--tm-surface)", border: "1px solid var(--tm-accent-ring)", borderRadius: "var(--tm-radius)", padding: "20px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-accent)", marginBottom: 4 }}>DOMAIN DRILL-DOWN</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)" }}>{activeDomain}</div>
              </div>
              <button onClick={() => setActiveDomain(null)} style={{ background: "none", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-sm)", color: "var(--tm-text-faint)", cursor: "pointer", padding: "5px 12px", fontSize: 12, fontFamily: "inherit" }}>
                ✕ Close
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
              {activeDomainSkills.map(skill => (
                <div key={skill.key} style={{ padding: "12px 14px", borderRadius: "var(--tm-radius-sm)", background: "rgba(255,255,255,0.02)", border: "1px solid var(--tm-border-soft)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--tm-text)" }}>{skill.display_name}</div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--tm-accent)", fontFamily: "var(--tm-font-mono)" }}>L{skill.level}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--tm-text-faint)", marginBottom: 6 }}>{skill.proficiency_title}</div>
                  <div style={{ height: 3, background: "var(--tm-border)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(skill.level / 5) * 100}%`, background: skill.level >= 3 ? "var(--tm-success)" : skill.level >= 2 ? "var(--tm-warning)" : "var(--tm-danger)", borderRadius: 99 }} />
                  </div>
                  {skill.evidence_text ? (
                    <div style={{ fontSize: 10, color: "var(--tm-text-faint)", marginTop: 6, lineHeight: 1.5 }}>{skill.evidence_text.slice(0, 60)}…</div>
                  ) : (
                    <div style={{ fontSize: 10, color: "var(--tm-warning)", marginTop: 6, fontStyle: "italic" }}>No proof · keyword-inferred</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legend */}
        <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(255,255,255,0.01)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-sm)", display: "flex", gap: 24, flexWrap: "wrap", position: "relative", zIndex: 1 }}>
          {["Proof logged from CV (dashed ← back to You)", "Unlock path (blue, what to learn next)", "Skill tree edge (faint)"].map((leg, i) => (
            <div key={i} style={{ fontSize: 11, color: "var(--tm-text-faint)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 16, height: 1.5, display: "inline-block", background: i === 0 ? "var(--tm-accent)" : i === 1 ? "rgba(91,156,255,0.75)" : "rgba(255,255,255,0.2)", borderRadius: 99 }} />
              {leg}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
