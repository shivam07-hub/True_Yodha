"use client"

import "./skills.css"

import Link from "next/link"
import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { RequiresCV } from "@/components/empty/RequiresCV"
import { ParticleLoading } from "@/components/loading/particle-loading"
import { SkillsSkeleton } from "@/components/loading/page-skeletons"
import { DomainRadar as SkillsDomainRadar } from "@/components/skills/domain-radar"
import { ScoreRing } from "@/components/skills/score-ring"
import { DomainAccordionRow } from "@/components/skills/domain-accordion-row"
import { SkillAuditView } from "@/components/skills/skill-audit-view"
import { ShareButton } from "@/components/profile/ShareButton"
import { ViewTriadToggle, useTriadView } from "@/components/ui/view-triad-toggle"
import { scores, users } from "@/lib/api"
import type { UserSkillsByDomain } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"

const EMPTY_SKILLS: UserSkillsByDomain = { by_domain: {}, by_cluster: {} }

type SortMode = "gap" | "alpha" | "skills"
type ShowFilter = "all" | "at-risk" | "building" | "strong"

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
  const [view, setView] = useTriadView("skills")

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

  if (!ready || skillsLoading) return <SkillsSkeleton />

  const totalScore = scoreData ? Math.round(scoreData.total_score) : null
  const allSkills = Object.values(skills.by_domain).flat()
  const totalSkills = allSkills.length
  const proofCount = allSkills.filter(s => s.evidence_text).length
  const needProofCount = Math.max(0, totalSkills - proofCount)
  const weakDomainCount = domainEntries.filter(d => d.avg < 40).length

  const IconBtn = ({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) => (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      style={{
        width: 32, height: 32, borderRadius: 8, fontSize: 14, fontWeight: active ? 700 : 500,
        fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        background: active ? "var(--tm-interactive)" : "transparent",
        color: active ? "var(--tm-interactive-fg)" : "var(--tm-text-faint)",
        border: `1px solid ${active ? "var(--tm-interactive)" : "var(--tm-border-soft)"}`,
        transition: "all 150ms var(--tm-ease)",
        flexShrink: 0,
      }}
    >{icon}</button>
  )

  const DotBtn = ({ active, onClick, color, count, label }: { active: boolean; onClick: () => void; color: string; count: number; label: string }) => (
    <button
      onClick={onClick}
      title={`${label} (${count})`}
      aria-label={`${label}: ${count}`}
      aria-pressed={active}
      style={{
        height: 32, padding: "0 10px", borderRadius: 8, fontSize: 11, fontWeight: active ? 700 : 500,
        fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
        background: active ? "var(--tm-interactive)" : "transparent",
        color: active ? "var(--tm-interactive-fg)" : "var(--tm-text-faint)",
        border: `1px solid ${active ? "var(--tm-interactive)" : "var(--tm-border-soft)"}`,
        transition: "all 150ms var(--tm-ease)",
        flexShrink: 0,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: active ? "var(--tm-interactive-fg)" : color, flexShrink: 0 }} />
      {count}
    </button>
  )

  return (
    <>
      <RequiresCV surface="skills">
      <div className="tm-page-enter tm-skills-page">

        {/* Header */}
        <div className="tm-skills-header" style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="tm-label-caps" style={{ marginBottom: 6 }}>Skill Intelligence Overview</div>
            <h1 className="tm-title text-balance" style={{ marginBottom: 4 }}>Skill Intelligence</h1>
            <p className="tm-meta text-pretty">
              {scoreData
                ? `${domainEntries.length} domains · ${totalSkills} skills · ${needProofCount} need proof · ${weakDomainCount} below 40%`
                : ""}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {profile?.ninja_name ? (
              <ShareButton
                url={typeof window !== "undefined" ? `${window.location.origin}/profile/${profile.ninja_name}` : `/profile/${profile.ninja_name}`}
                ninjaName={profile.ninja_name}
                score={totalScore}
              />
            ) : null}
            {totalScore !== null && <ScoreRing score={totalScore} />}
          </div>
        </div>

        {scoreData ? (
          <div className="tm-skills-stat-grid" aria-label="Skill summary">
            <button type="button" onClick={() => setShow("all")} className="tm-skills-stat-tile">
              <span className="label">Domains</span>
              <span className="value">{domainEntries.length}</span>
            </button>
            <button type="button" onClick={() => setShow("all")} className="tm-skills-stat-tile">
              <span className="label">Skills</span>
              <span className="value">{totalSkills}</span>
            </button>
            <button type="button" onClick={() => setShow("all")} className="tm-skills-stat-tile">
              <span className="label">Need proof</span>
              <span className="value">{needProofCount}</span>
              <span className="meta">{needProofCount === 0 ? "All evidenced" : "Add CV evidence"}</span>
            </button>
            <button type="button" onClick={() => setShow("at-risk")} className="tm-skills-stat-tile">
              <span className="label">Below 40%</span>
              <span className="value warning">{weakDomainCount}</span>
              <span className="meta">Tap to practice</span>
            </button>
          </div>
        ) : null}

        {/* Mobile-only triad toggle (Intel / Map / Audit) — shared component */}
        <div className="tm-skills-mview-wrap">
          <ViewTriadToggle page="skills" value={view} onChange={setView} ariaLabel="Skill view" />
        </div>

        {/* Sort/Filter bar — icon-only, enterprise compact */}
        <div
          className="tm-skills-chrome"
          data-mview={view}
          style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20, flexWrap: "wrap" }}
        >
          {/* VIEW group — desktop only; on mobile the segmented control above replaces this */}
          <span className="tm-skills-view-toggle-desktop" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <IconBtn active={view === "intel"} onClick={() => setView("intel")} icon="⊞" label="Domains view" />
            <IconBtn active={view === "audit"} onClick={() => setView("audit")} icon="◈" label="Audit view" />
          </span>

          {view !== "audit" && (
            <>
              <div style={{ width: 1, height: 20, background: "var(--tm-border-soft)", margin: "0 4px" }} />
              {/* SORT group */}
              <IconBtn active={sort === "gap"} onClick={() => setSort("gap")} icon="↘" label="Sort: gap first" />
              <IconBtn active={sort === "alpha"} onClick={() => setSort("alpha")} icon="Aa" label="Sort: A → Z" />
              <IconBtn active={sort === "skills"} onClick={() => setSort("skills")} icon="#" label="Sort: most skills" />

              <div style={{ width: 1, height: 20, background: "var(--tm-border-soft)", margin: "0 4px" }} />
              {/* SHOW group — dot + count */}
              <DotBtn active={show === "all"} onClick={() => setShow("all")} color="var(--tm-text-faint)" count={counts.all} label="Show all" />
              <DotBtn active={show === "at-risk"} onClick={() => setShow("at-risk")} color="var(--tm-danger)" count={counts["at-risk"]} label="At risk" />
              <DotBtn active={show === "building"} onClick={() => setShow("building")} color="var(--tm-tier-building-fg)" count={counts.building} label="Building" />
              <DotBtn active={show === "strong"} onClick={() => setShow("strong")} color="var(--tm-success)" count={counts.strong} label="Strong" />
            </>
          )}

          <div className="tm-skills-actions-right" style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <Link href="/cv" style={{
              fontSize: 12, fontWeight: 600, color: "var(--tm-text-faint)", textDecoration: "none",
              padding: "7px 16px", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-sm)",
              transition: "all 150ms",
            }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--tm-interactive)"; e.currentTarget.style.borderColor = "var(--tm-int-border)" }}
              onMouseLeave={e => { e.currentTarget.style.color = "var(--tm-text-faint)"; e.currentTarget.style.borderColor = "var(--tm-border-soft)" }}
            >CV →</Link>
            <Link href="/forge?diary=1" style={{
              fontSize: 12, fontWeight: 700, color: "var(--tm-interactive-fg)", textDecoration: "none",
              padding: "7px 16px", background: "var(--tm-interactive)", border: "1px solid var(--tm-interactive)",
              borderRadius: "var(--tm-radius-sm)", transition: "all 150ms",
            }}
              onMouseEnter={e => { e.currentTarget.style.opacity = "0.85" }}
              onMouseLeave={e => { e.currentTarget.style.opacity = "1" }}
            >★ Practice</Link>
          </div>
        </div>

        {/* Two-column layout (desktop) / single-pane (mobile, driven by data-mview) */}
        <div className="tm-skills-grid" data-mview={view}>

          {/* Left — domain accordion OR audit view */}
          <div className="tm-skills-list-pane">
            {skillsLoading ? (
              <ParticleLoading message="Loading your skill constellation…" height={400} />
            ) : totalSkills === 0 ? (
              <div style={{ height: 300, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", borderRadius: "var(--tm-radius-lg)" }}>
                <div style={{ fontSize: 36 }}>⬡</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)" }}>No skills mapped from your CV yet</div>
                <div style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>Re-upload your CV to re-parse — different file formats can yield different results.</div>
                <Link href="/cv?upload=1" style={{ marginTop: 6, padding: "0 18px", height: 42, display: "inline-flex", alignItems: "center", borderRadius: "var(--tm-radius-pill)", background: "var(--tm-interactive)", color: "var(--tm-interactive-fg)", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>Re-upload CV</Link>
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

          {/* Right — Domain Map (sticky on desktop, inline on mobile) */}
          <div className="tm-skills-radar-panel">
            <div className="tm-skills-radar-card">
              <div className="tm-label-caps" style={{ marginBottom: 4 }}>Domain Map</div>
              <div style={{ fontSize: 12, color: "var(--tm-text-faint)", marginBottom: 16 }}>
                {domainEntries.length} domains · tap to inspect
              </div>
              {totalSkills > 0 ? (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <SkillsDomainRadar
                    userSkills={skills}
                    onDomainClick={d => {
                      setActiveDomain(a => a === d ? null : d)
                      setExpandedDomain(p => p === d ? null : d)
                    }}
                    activeDomain={activeDomain}
                  />
                </div>
              ) : (
                <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ fontSize: 11, color: "var(--tm-text-faint)", textAlign: "center" }}>No data yet</div>
                </div>
              )}
              <div className="tm-skills-radar-info">
                <span style={{ opacity: 0.6 }}>ℹ</span>
                <span>Each point = one domain. Distance from center = score.</span>
              </div>
            </div>
          </div>

        </div>
      </div>
      </RequiresCV>
    </>
  )
}
