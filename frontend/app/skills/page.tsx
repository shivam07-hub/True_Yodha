"use client"

import Link from "next/link"
import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { ParticleLoading } from "@/components/ui/particle-loading"
import { DomainRadar as SkillsDomainRadar } from "@/components/skills/domain-radar"
import { ScoreRing } from "@/components/skills/score-ring"
import { DomainAccordionRow } from "@/components/skills/domain-accordion-row"
import { SkillAuditView } from "@/components/skills/skill-audit-view"
import { ShareButton } from "@/components/profile/ShareButton"
import { scores, users } from "@/lib/api"
import type { UserSkillsByDomain } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"

const EMPTY_SKILLS: UserSkillsByDomain = { by_domain: {}, by_cluster: {} }

type SortMode = "gap" | "alpha" | "skills"
type ShowFilter = "all" | "at-risk" | "building" | "strong"
type ViewMode = "domains" | "audit"

function domainAvg(items: ReturnType<typeof Object.values<ReturnType<typeof Object.values>[0]>>[0]) {
  if (!items.length) return 0
  return Math.round(items.reduce((s: number, it: { level: number }) => s + it.level, 0) / items.length * 20)
}

function domainStatus(avg: number): ShowFilter {
  if (avg < 40) return "at-risk"
  if (avg < 70) return "building"
  return "strong"
}

export default function SkillsPage() {
  const { token, ready } = useAuth()
  const [activeDomain, setActiveDomain] = useState<string | null>(null)
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null)
  const [sort, setSort] = useState<SortMode>("gap")
  const [show, setShow] = useState<ShowFilter>("all")
  const [view, setView] = useState<ViewMode>("domains")

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

  const { data: profile } = useQuery({
    queryKey: ["users-me", token],
    queryFn: () => users.me(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })

  const skills = userSkills ?? EMPTY_SKILLS

  const domainEntries = useMemo(() => {
    return Object.entries(skills.by_domain)
      .map(([domain, items]) => ({ domain, items, avg: domainAvg(items as { level: number }[]) }))
  }, [skills])

  const counts = useMemo(() => ({
    all: domainEntries.length,
    "at-risk": domainEntries.filter(d => d.avg < 40).length,
    building: domainEntries.filter(d => d.avg >= 40 && d.avg < 70).length,
    strong: domainEntries.filter(d => d.avg >= 70).length,
  }), [domainEntries])

  const filteredSorted = useMemo(() => {
    let entries = show === "all" ? domainEntries : domainEntries.filter(d => domainStatus(d.avg) === show)
    if (sort === "gap") entries = [...entries].sort((a, b) => a.avg - b.avg)
    else if (sort === "alpha") entries = [...entries].sort((a, b) => a.domain.localeCompare(b.domain))
    else entries = [...entries].sort((a, b) => b.items.length - a.items.length)
    return entries
  }, [domainEntries, sort, show])

  const biggestGapDomain = domainEntries.length ? [...domainEntries].sort((a, b) => a.avg - b.avg)[0]?.domain : null

  if (!ready) return null

  const totalScore = scoreData ? Math.round(scoreData.total_score) : null
  const allSkills = Object.values(skills.by_domain).flat()
  const totalSkills = allSkills.length
  const proofCount = allSkills.filter(s => s.evidence_text).length
  const weakDomainCount = domainEntries.filter(d => d.avg < 40).length

  const PillBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button onClick={onClick} style={{
      padding: "5px 12px", borderRadius: 99, fontSize: 12, fontWeight: active ? 700 : 500,
      fontFamily: "inherit", cursor: "pointer",
      background: active ? "var(--tm-accent)" : "transparent",
      color: active ? "var(--tm-accent-fg)" : "var(--tm-text-faint)",
      border: `1px solid ${active ? "var(--tm-accent)" : "var(--tm-border-soft)"}`,
      transition: "all 150ms var(--tm-ease)",
    }}>{children}</button>
  )

  return (
    <AppShell>
      <div className="tm-page-enter" style={{ minHeight: "100vh", padding: "var(--tm-page-py) var(--tm-page-px)" }}>

        {/* Header */}
        <div className="tm-skills-header" style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="tm-label-caps" style={{ marginBottom: 6 }}>Skill Intelligence Overview</div>
            <h1 className="tm-title text-balance" style={{ marginBottom: 4 }}>Skill Intelligence</h1>
            <p className="tm-meta text-pretty">
              {scoreData
                ? `${domainEntries.length} domains · ${totalSkills} skills · ${totalSkills - proofCount} need proof · ${weakDomainCount} below 40%`
                : "Upload your CV to see your Myro Score"}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {profile?.ninja_name ? (
              <ShareButton
                url={typeof window !== "undefined" ? `${window.location.origin}/profile/${profile.ninja_name}` : `/profile/${profile.ninja_name}`}
                ninjaName={profile.ninja_name}
              />
            ) : null}
            {totalScore !== null && <ScoreRing score={totalScore} />}
          </div>
        </div>

        {/* Sort/Filter bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
          <span className="tm-label-caps" style={{ letterSpacing: "0.1em", fontSize: 10 }}>VIEW</span>
          <div style={{ display: "flex", gap: 6 }}>
            <PillBtn active={view === "domains"} onClick={() => setView("domains")}>Domains</PillBtn>
            <PillBtn active={view === "audit"} onClick={() => setView("audit")}>◈ Audit</PillBtn>
          </div>
          {view === "domains" && (
            <>
              <div style={{ width: 1, height: 20, background: "var(--tm-border-soft)" }} />
              <span className="tm-label-caps" style={{ letterSpacing: "0.1em", fontSize: 10 }}>SORT</span>
              <div style={{ display: "flex", gap: 6 }}>
                <PillBtn active={sort === "gap"} onClick={() => setSort("gap")}>Gap first</PillBtn>
                <PillBtn active={sort === "alpha"} onClick={() => setSort("alpha")}>A → Z</PillBtn>
                <PillBtn active={sort === "skills"} onClick={() => setSort("skills")}>Most skills</PillBtn>
              </div>
              <div style={{ width: 1, height: 20, background: "var(--tm-border-soft)" }} />
              <span className="tm-label-caps" style={{ letterSpacing: "0.1em", fontSize: 10 }}>SHOW</span>
              <div style={{ display: "flex", gap: 6 }}>
                <PillBtn active={show === "all"} onClick={() => setShow("all")}>All {counts.all}</PillBtn>
                <PillBtn active={show === "at-risk"} onClick={() => setShow("at-risk")}>
                  <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--tm-danger)", marginRight: 5, verticalAlign: "middle" }} />
                  At risk {counts["at-risk"]}
                </PillBtn>
                <PillBtn active={show === "building"} onClick={() => setShow("building")}>
                  <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#d97706", marginRight: 5, verticalAlign: "middle" }} />
                  Building {counts.building}
                </PillBtn>
                <PillBtn active={show === "strong"} onClick={() => setShow("strong")}>
                  <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--tm-success)", marginRight: 5, verticalAlign: "middle" }} />
                  Strong {counts.strong}
                </PillBtn>
              </div>
            </>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <Link href="/cv" style={{
              fontSize: 12, fontWeight: 600, color: "var(--tm-text-faint)", textDecoration: "none",
              padding: "7px 16px", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-sm)",
              transition: "all 150ms",
            }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--tm-accent)"; e.currentTarget.style.borderColor = "var(--tm-accent-ring)" }}
              onMouseLeave={e => { e.currentTarget.style.color = "var(--tm-text-faint)"; e.currentTarget.style.borderColor = "var(--tm-border-soft)" }}
            >CV →</Link>
            <Link href="/forge?diary=1" style={{
              fontSize: 12, fontWeight: 700, color: "var(--tm-accent-fg)", textDecoration: "none",
              padding: "7px 16px", background: "var(--tm-accent)", border: "1px solid var(--tm-accent)",
              borderRadius: "var(--tm-radius-sm)", transition: "all 150ms",
            }}
              onMouseEnter={e => { e.currentTarget.style.opacity = "0.85" }}
              onMouseLeave={e => { e.currentTarget.style.opacity = "1" }}
            >★ Log to Forge</Link>
          </div>
        </div>

        {/* Two-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }}>

          {/* Left — domain accordion OR audit view */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {skillsLoading ? (
              <ParticleLoading message="Loading your skill constellation…" height={400} />
            ) : totalSkills === 0 ? (
              <div style={{ height: 300, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-lg)" }}>
                <div style={{ fontSize: 36 }}>⬡</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)" }}>No skills mapped yet</div>
                <div style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>Upload your CV to generate your skill constellation</div>
                <Button variant="solid" size="lg" render={<Link href="/cv" />}>Upload CV</Button>
              </div>
            ) : view === "audit" ? (
              <SkillAuditView allSkills={allSkills} />
            ) : filteredSorted.map(({ domain, items, avg }) => (
              <DomainAccordionRow
                key={domain}
                domain={domain}
                items={items}
                avg={avg}
                isExpanded={expandedDomain === domain}
                isBiggestGap={domain === biggestGapDomain}
                onToggle={() => {
                  setExpandedDomain(p => p === domain ? null : domain)
                  setActiveDomain(domain)
                }}
                token={token!}
              />
            ))}
          </div>

          {/* Right — sticky Domain Map */}
          <div style={{ position: "sticky", top: 20 }}>
            <div style={{ background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-lg)", padding: "20px 20px 16px", overflow: "hidden" }}>
              <div className="tm-label-caps" style={{ marginBottom: 4 }}>Domain Map</div>
              <div style={{ fontSize: 12, color: "var(--tm-text-faint)", marginBottom: 16 }}>
                {domainEntries.length} domains · hover or click to inspect
              </div>
              {totalSkills > 0 ? (
                <SkillsDomainRadar
                  userSkills={skills}
                  onDomainClick={d => {
                    setActiveDomain(a => a === d ? null : d)
                    setExpandedDomain(p => p === d ? null : d)
                  }}
                  activeDomain={activeDomain}
                />
              ) : (
                <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ fontSize: 11, color: "var(--tm-text-faint)", textAlign: "center" }}>No data yet</div>
                </div>
              )}
              <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "var(--tm-radius-sm)", border: "1px solid var(--tm-border-soft)", display: "flex", gap: 8 }}>
                <span style={{ fontSize: 10, color: "var(--tm-text-faint)", opacity: 0.6 }}>ℹ</span>
                <span style={{ fontSize: 10, color: "var(--tm-text-faint)", lineHeight: 1.5 }}>
                  Each point = one domain. Distance from center = score.
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </AppShell>
  )
}
