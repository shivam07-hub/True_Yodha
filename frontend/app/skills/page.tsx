"use client"

import Link from "next/link"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
// DEACTIVATED — import when re-activating Skill Tree (see toggle comment in JSX)
// import { SkillNodeMap } from "@/components/skills/skill-node-map"
import { ParticleLoading } from "@/components/ui/particle-loading"
import { DomainRadar as SkillsDomainRadar } from "@/components/skills/domain-radar"
import { scores, users } from "@/lib/api"
import type { UserSkillsByDomain } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"

const EMPTY_SKILLS: UserSkillsByDomain = { by_domain: {}, by_cluster: {} }

export default function SkillsPage() {
  const { token, ready } = useAuth()
  // DEACTIVATED: Skill Tree view hidden. See toggle comment below.
  const [view] = useState<"radar">("radar")
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
  const totalSkills = Object.values(skills.by_domain).flat().length
  const levellingCount = Object.values(skills.by_domain).flat().filter(s => s.level > 0 && s.level < 5).length
  const proofCount = Object.values(skills.by_domain).flat().filter(s => s.evidence_text).length

  const activeDomainSkills = activeDomain ? (skills.by_domain[activeDomain] ?? []) : []

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
                ? `${scoreData.skills_assessed} skills · ${scoreData.gap_skills.length} gaps · ${proofCount} with proof · ${levellingCount} levelling`
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

        {/*
          Domain Inspector — lives BETWEEN Domain Strip and the visualisation
          canvas (Constitution rule 1: Causal Proximity, rule 4: Progressive
          Not Appended). Always mounted; collapses to zero height when no
          domain is selected so the transition is smooth in both directions
          (Constitution rule 5: No Invisible State Change).
        */}
        <div
          aria-hidden={!activeDomain}
          style={{
            display: "grid",
            gridTemplateRows: activeDomain && activeDomainSkills.length > 0 ? "1fr" : "0fr",
            opacity: activeDomain && activeDomainSkills.length > 0 ? 1 : 0,
            marginBottom: activeDomain && activeDomainSkills.length > 0 ? 16 : 0,
            transition: "grid-template-rows 320ms var(--tm-ease), opacity 240ms var(--tm-ease), margin-bottom 320ms var(--tm-ease)",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div style={{ overflow: "hidden", minHeight: 0 }}>
            {activeDomain && activeDomainSkills.length > 0 && (
              <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-accent-ring)", borderRadius: "var(--tm-radius)", padding: "20px 24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-accent)", marginBottom: 4 }}>Domain Inspector</div>
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
          </div>
        </div>

        {/*
          Constellation / Radar canvas — receives selectedDomain so non-selected
          nodes dim, keeping a single frame of truth (Constitution rule 2).
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
          ) :
          /* DEACTIVATED — Skill Tree canvas. Keep SkillNodeMap import intact.
             Re-activate alongside the toggle above when Skill Tree has a
             distinct, high-value visual purpose vs Domain Radar.

          view === "tree" ? (
            <div style={{ padding: "18px 10px 10px", background: "var(--tm-surface-2)" }}>
              <SkillNodeMap
                userSkills={skills}
                gapSkills={scoreData?.gap_skills ?? []}
                selectedDomain={activeDomain}
                onDomainClick={d => setActiveDomain(a => a === d ? null : d)}
              />
            </div>
          ) : */ (
            <div style={{ padding: "28px 32px" }}>
              <SkillsDomainRadar userSkills={skills} onDomainClick={d => setActiveDomain(a => a === d ? null : d)} activeDomain={activeDomain} />
            </div>
          )}
        </div>

      </div>
    </AppShell>
  )
}
