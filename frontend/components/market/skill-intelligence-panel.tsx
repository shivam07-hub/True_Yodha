"use client"

import Link from "next/link"
import { BarChart3, BookOpen, Briefcase, ExternalLink, Target, X } from "lucide-react"
import type { SkillReadiness } from "@/lib/skill-intelligence"

type TopCompany = { name: string; value: number }
type HeatmapCell = { ci: number; si: number } | null

interface SkillIntelligencePanelProps {
  skillName: string | null
  level: number
  readiness: SkillReadiness
  nextLevel: number
  demand: number
  topCompanies: TopCompany[]
  evidenceLines: string[]
  selectedCell: HeatmapCell
  onClearCell: (cell: Exclude<HeatmapCell, null>) => void
  onViewSkillJobs: (skillName: string) => void
}

export function SkillIntelligencePanel({
  skillName,
  level,
  readiness,
  nextLevel,
  demand,
  topCompanies,
  evidenceLines,
  selectedCell,
  onClearCell,
  onViewSkillJobs,
}: SkillIntelligencePanelProps) {
  const encodedSkill = encodeURIComponent(skillName ?? "")

  return (
    <aside className="si-panel" aria-label="Selected skill intelligence">
      <div className="si-panel-top">
        <div className="si-panel-icon"><BarChart3 size={22} /></div>
        <div>
          <div className="si-section-label">Skill Intelligence</div>
          <h2>{skillName}</h2>
          <span className={`si-level is-${readiness.toLowerCase()}`}>L{level} / {readiness}</span>
        </div>
        <button
          type="button"
          className="si-panel-close"
          aria-label="Clear selected heatmap cell"
          disabled={!selectedCell}
          onClick={() => selectedCell && onClearCell(selectedCell)}
        >
          <X size={16} />
        </button>
      </div>

      <div className="si-ladder" aria-label={`From level ${level} to level ${nextLevel}`}>
        <b>L{level}</b>
        {[1, 2, 3, 4, 5].map((step) => <span key={step} className={step <= level ? "is-filled" : ""} />)}
        <b>L{nextLevel}</b>
      </div>

      <div className="si-panel-block">
        <h3>Company demand</h3>
        <strong>{demand}</strong>
        <p>Open roles across your followed companies</p>
        <div className="si-company-rank">
          {topCompanies.length ? topCompanies.map((row) => (
            <span key={row.name}><b>{row.name}</b><em>{row.value}</em></span>
          )) : <span><b>No demand yet</b><em>0</em></span>}
        </div>
      </div>

      <div className="si-panel-block">
        <h3>Your CV evidence</h3>
        {evidenceLines.length ? evidenceLines.map((line) => (
          <p key={line} className="si-evidence">{line}</p>
        )) : <p className="si-evidence is-muted">No strong CV proof found yet.</p>}
        <Link href={`/cv?skill=${encodedSkill}`}>Add more evidence <ExternalLink size={13} /></Link>
      </div>

      <div className="si-panel-block">
        <h3>Next step</h3>
        <p>Move from L{level} to L{nextLevel} by practicing applied questions, then add proof back to your CV.</p>
      </div>

      <div className="si-panel-actions">
        <Link className="si-primary" href={`/forge?skill=${encodedSkill}`}><BookOpen size={16} /> Practice</Link>
        <Link href={`/cv?skill=${encodedSkill}`}><Briefcase size={16} /> Improve CV proof</Link>
        <button type="button" onClick={() => skillName && onViewSkillJobs(skillName)}><Target size={16} /> View jobs</button>
      </div>
    </aside>
  )
}
