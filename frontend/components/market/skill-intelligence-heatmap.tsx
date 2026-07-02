"use client"

import "./skill-intelligence-heatmap.css"

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import Link from "next/link"
import { Briefcase, ChevronRight, Settings2, Target, TrendingUp, Users } from "lucide-react"
import type { FollowedCompany, UserSkillDemandItem, UserSkillItem } from "@/lib/api"
import { buildSkillEvidenceIndex, nextSkillLevel, skillDemandTotal, skillReadiness } from "@/lib/skill-intelligence"
import { MYRO_COINS_POLICY } from "@/lib/xp-policy"
import { SkillColumnPicker } from "./skill-column-picker"
import { SkillIntelligencePanel } from "./skill-intelligence-panel"

type HeatmapCell = { ci: number; si: number } | null
type HeatStyle = CSSProperties & { "--si-heat": string }

interface SkillIntelligenceHeatmapProps {
  companies: FollowedCompany[]
  rowDataMap: Record<string, Record<string, number> | null>
  skills: string[]
  allSkills: UserSkillDemandItem[]
  selectedSkillNames: Set<string>
  selectedCell: HeatmapCell
  skillEvidence: ReturnType<typeof buildSkillEvidenceIndex>
  trackedCompanyTotal: number
  targetRoles: string[]
  targetLocations: string[]
  isFetching: boolean
  isLoggedIn: boolean
  onToggleSkill: (name: string) => void
  onCellSelect: (ci: number, si: number) => void
  onPersonalise: () => void
  onViewSkillJobs: (skillName: string) => void
}

function companyInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "CO"
}

function demandStyle(value: number, max: number): HeatStyle {
  const intensity = value <= 0 ? 4 : Math.round((0.1 + (value / Math.max(max, 1)) * 0.82) * 100)
  return { "--si-heat": `${intensity}%` }
}

function evidenceLines(evidence?: UserSkillItem): string[] {
  const raw = evidence?.evidence_text?.trim()
  if (!raw) return []
  return raw
    .split(/\n|\u2022|;|\.\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
}

function PersonalizationSignal({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="si-signal">
      {icon}
      {label}
    </span>
  )
}

export function SkillIntelligenceHeatmap({
  companies,
  rowDataMap,
  skills,
  allSkills,
  selectedSkillNames,
  selectedCell,
  skillEvidence,
  trackedCompanyTotal,
  targetRoles,
  targetLocations,
  isFetching,
  isLoggedIn,
  onToggleSkill,
  onCellSelect,
  onPersonalise,
  onViewSkillJobs,
}: SkillIntelligenceHeatmapProps) {
  const [hoverCell, setHoverCell] = useState<HeatmapCell>(null)
  const [selectedSkillName, setSelectedSkillName] = useState<string | null>(skills[0] ?? null)
  const [showSkillPicker, setShowSkillPicker] = useState(false)

  useEffect(() => {
    if (!selectedSkillName || !skills.includes(selectedSkillName)) {
      setSelectedSkillName(skills[0] ?? null)
    }
  }, [selectedSkillName, skills])

  const maxVal = useMemo(() => {
    let max = 1
    for (const rowData of Object.values(rowDataMap)) {
      if (!rowData) continue
      for (const value of Object.values(rowData)) max = Math.max(max, value)
    }
    return max
  }, [rowDataMap])

  const companyTotals = useMemo(() => companies.map((company) => {
    const row = rowDataMap[company.company_name]
    const total = row ? skills.reduce((sum, skill) => sum + (row[skill] ?? 0), 0) : null
    return { company, total }
  }), [companies, rowDataMap, skills])

  const selectedSkill = useMemo(() => (
    allSkills.find((skill) => skill.display_name === selectedSkillName) ?? null
  ), [allSkills, selectedSkillName])

  const selectedEvidence = selectedSkillName ? skillEvidence[selectedSkillName.toLowerCase()] : undefined
  const selectedLevel = selectedSkill?.current_level ?? selectedEvidence?.level ?? 0
  const readiness = skillReadiness(selectedLevel)
  const nextLevel = nextSkillLevel(selectedLevel)
  const selectedDemand = selectedSkillName ? skillDemandTotal(rowDataMap, selectedSkillName) : 0
  const selectedEvidenceLines = evidenceLines(selectedEvidence)
  const topCompaniesForSkill = useMemo(() => {
    if (!selectedSkillName) return []
    return companies
      .map((company) => ({
        name: company.company_name,
        value: rowDataMap[company.company_name]?.[selectedSkillName] ?? 0,
      }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 4)
  }, [companies, rowDataMap, selectedSkillName])

  const selectedCount = selectedSkillNames.size
  const roleLabel = targetRoles[0] ?? "Role signals"
  const locationLabel = targetLocations[0] ?? "Location signals"
  const followedCap = MYRO_COINS_POLICY.followedCompanyLimit

  if (!companies.length) {
    return (
      <section className="si-empty">
        <h2>Track companies to build your skill map</h2>
        <p>Follow companies from Live Job Data and Myro will map their hiring skills against your CV.</p>
        <button type="button" className="si-primary" onClick={onPersonalise}>Find companies</button>
      </section>
    )
  }

  if (!skills.length) return null

  return (
    <section className="si-shell" aria-label="Skill Intelligence">
      <div className="si-cockpit">
        <div className="si-cockpit-copy">
          <h1>We track what skills companies are hiring for.</h1>
          <p>Skill Intelligence merges your CV levels with live company demand.</p>
        </div>
        <div className="si-meter" aria-label={`${trackedCompanyTotal} companies tracked`}>
          <div className="si-meter-top">
            <Users size={15} />
            <span>{trackedCompanyTotal} companies tracked</span>
            <i aria-hidden />
          </div>
          <div className="si-meter-bar"><span style={{ width: `${Math.min(100, Math.max(8, (companies.length / followedCap) * 100))}%` }} /></div>
          <button type="button" onClick={onPersonalise}>{companies.length} / {followedCap} followed</button>
        </div>
        <div className="si-signals" aria-label="Personalization signals">
          <PersonalizationSignal icon={<Target size={14} />} label="Based on your CV skills" />
          <PersonalizationSignal icon={<Briefcase size={14} />} label={roleLabel} />
          <PersonalizationSignal icon={<TrendingUp size={14} />} label={locationLabel} />
        </div>
        <button type="button" className="si-personalise" onClick={onPersonalise}>
          <Settings2 size={15} />
          Personalise tracking
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="si-company-rail" aria-label="Tracked companies">
        <div className="si-section-label">Tracked companies</div>
        <div className="si-company-strip">
          {companyTotals.map(({ company, total }) => (
            <Link key={company.company_name} href={`/companies/${encodeURIComponent(company.company_name)}`} className="si-company-card">
              <span className="si-company-logo">{companyInitials(company.company_name)}</span>
              <span className="si-company-name">{company.company_name}</span>
              <span className="si-company-total">{total == null ? "Syncing" : `${total} roles`}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="si-board">
        <div className="si-main">
          <div className="si-toolbar">
            <div>
              <div className="si-section-label">Skill demand heatmap</div>
              <div className="si-toolbar-sub">Company demand by CV skill level</div>
            </div>
            <div className="si-toolbar-actions">
              <div className="si-legend" aria-label="Demand scale">
                <span>Low</span>
                {[14, 28, 42, 60, 78, 94].map((heat) => <i key={heat} style={{ "--si-heat": `${heat}%` } as HeatStyle} />)}
                <span>High</span>
              </div>
              {isLoggedIn && allSkills.length > 0 ? (
                <SkillColumnPicker
                  skills={skills}
                  allSkills={allSkills}
                  selectedSkillNames={selectedSkillNames}
                  selectedCount={selectedCount}
                  open={showSkillPicker}
                  onOpenChange={setShowSkillPicker}
                  onToggleSkill={onToggleSkill}
                />
              ) : null}
            </div>
          </div>

          <div className="si-matrix-scroll">
            <table className="si-matrix">
              <thead>
                <tr>
                  <th className="si-company-head">Companies</th>
                  {skills.map((skill) => {
                    const item = allSkills.find((s) => s.display_name === skill)
                    const level = item?.current_level ?? skillEvidence[skill.toLowerCase()]?.level ?? 0
                    const status = skillReadiness(level)
                    const isSelected = selectedSkillName === skill
                    return (
                      <th key={skill}>
                        <button type="button" className={isSelected ? "is-selected" : ""} onClick={() => setSelectedSkillName(skill)} title={skill}>
                          <span>{skill}</span>
                          <b className={`si-level is-${status.toLowerCase()}`}>L{level} / {status}</b>
                        </button>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {companyTotals.map(({ company, total }, ci) => {
                  const rowData = rowDataMap[company.company_name]
                  const loading = rowData === null
                  return (
                    <tr key={company.company_name}>
                      <td className="si-company-cell">
                        <Link href={`/companies/${encodeURIComponent(company.company_name)}`}>
                          <span>{companyInitials(company.company_name)}</span>
                          <b>{company.company_name}</b>
                          <em>{total == null ? "Loading" : `${total}`}</em>
                        </Link>
                      </td>
                      {loading ? skills.map((skill) => <td key={skill}><span className="si-cell-skeleton" /></td>) : skills.map((skill, si) => {
                        const value = rowData?.[skill] ?? 0
                        const active = selectedCell?.ci === ci && selectedCell?.si === si
                        const hovered = hoverCell?.ci === ci && hoverCell?.si === si
                        return (
                          <td key={skill}>
                            <button
                              type="button"
                              className={`si-demand-cell${active ? " is-active" : ""}${hovered ? " is-hovered" : ""}`}
                              style={demandStyle(value, maxVal)}
                              onMouseEnter={() => setHoverCell({ ci, si })}
                              onMouseLeave={() => setHoverCell(null)}
                              onClick={() => { setSelectedSkillName(skill); onCellSelect(ci, si) }}
                              aria-label={`${company.company_name}, ${skill}: ${value} matching roles`}
                            >
                              {value || ""}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="si-board-foot">
            <span>{isFetching ? "Refreshing visible matrix" : `Showing ${companies.length} followed companies`}</span>
            <button type="button" onClick={onPersonalise}>View all tracked companies <ChevronRight size={13} /></button>
          </div>
        </div>

        <SkillIntelligencePanel
          skillName={selectedSkillName}
          level={selectedLevel}
          readiness={readiness}
          nextLevel={nextLevel}
          demand={selectedDemand}
          topCompanies={topCompaniesForSkill}
          evidenceLines={selectedEvidenceLines}
          selectedCell={selectedCell}
          onClearCell={(cell) => onCellSelect(cell.ci, cell.si)}
          onViewSkillJobs={onViewSkillJobs}
        />
      </div>
    </section>
  )
}
