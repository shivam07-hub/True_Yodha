"use client"

import { useState } from "react"
import Link from "next/link"
import { InlineSkillCard } from "@/components/skills/skill-card-inline"
import { skillTier, skillTierLabel, skillTierHint } from "@/lib/skill-tier"
import type {
  GapPracticeSkill,
  OwnedPracticeSkill,
  PracticeSkills,
} from "@/lib/practice-skills"
import type { SkillFilterState } from "@/lib/skill-filter"
import type { DemandBand } from "@/lib/api"
import { demandBandDisplay, bandFromJobCount } from "@/lib/demand-band"

const PROFICIENCY_TITLES = ["None", "Scout", "Trailblazer", "Excavator", "Cartographer", "Legend"]

interface PracticeSkillListProps {
  token: string
  /** Already filtered + sorted by the page (applySkillFilter). */
  skills: PracticeSkills
  /** Total before filtering — to tell "no skills yet" from "filter matched none". */
  totalCount: number
  activeSkillName: string | null
  onPractice: (skillName: string, levelFrom: number, levelTo: number) => void
  filter: SkillFilterState
  onFilterChange: (next: SkillFilterState) => void
}

/**
 * The Intel skill surface. Status + domain filtering is owned by the page (the
 * header stat tiles drive it); this component renders the filtered result and
 * owns only the demand-sort toggle. Owned skills expand into the full
 * `InlineSkillCard`; gap skills expand into the lighter "acquire" card.
 */
export function PracticeSkillList({
  token, skills, totalCount, activeSkillName, onPractice, filter, onFilterChange,
}: PracticeSkillListProps) {
  const { owned, gaps } = skills
  const empty = owned.length + gaps.length === 0
  const noSkillsAtAll = totalCount === 0

  return (
    <section className="tm-pr-skills">
      <div className="tm-pr-skills-top">
        <div>
          <h2 className="tm-pr-skills-title">Your skills</h2>
          <div className="tm-pr-skills-sub">
            {owned.length} on your CV · {gaps.length} gaps from target jobs
          </div>
        </div>
        <div className="tm-pr-tabs" role="group" aria-label="Sort skills">
          <button
            type="button"
            className="tm-pr-tab tm-control-focus"
            aria-pressed={filter.sort === "default"}
            onClick={() => onFilterChange({ ...filter, sort: "default" })}
          >
            Default
          </button>
          <button
            type="button"
            className="tm-pr-tab tm-control-focus"
            aria-pressed={filter.sort === "demand"}
            onClick={() => onFilterChange({ ...filter, sort: "demand" })}
          >
            Hot skills
          </button>
        </div>
      </div>

      {empty ? (
        <div className="tm-pr-empty">
          {noSkillsAtAll ? "No skills mapped from your CV yet." : "No skills match this filter."}
        </div>
      ) : (
        <>
          {owned.length > 0 && (
            <>
              <GroupHeading text="On your CV — improve the pointer or level up" />
              <div className="tm-pr-rows">
                {owned.map((skill) => (
                  <OwnedRow
                    key={skill.item.key || skill.item.display_name}
                    skill={skill}
                    token={token}
                    active={skill.item.display_name === activeSkillName}
                    onPractice={() => onPractice(skill.item.display_name, skill.item.level, skill.targetLevel)}
                  />
                ))}
              </div>
            </>
          )}
          {gaps.length > 0 && (
            <>
              <GroupHeading text="Gaps from target jobs — add to your CV, then practice" />
              <div className="tm-pr-rows">
                {gaps.map((skill) => (
                  <GapRow
                    key={skill.skill_name}
                    skill={skill}
                    active={skill.skill_name === activeSkillName}
                    onPractice={() => onPractice(skill.skill_name, 0, skill.levelTo)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}

function DemandBadge({ band, jobCount }: { band: DemandBand; jobCount: number }) {
  // Owned/target skills carry a real percentile band; job-gap-only skills fall
  // back to a job-count-derived band so the demand signal is never silently lost.
  const resolved: DemandBand = band !== "none" ? band : bandFromJobCount(jobCount)
  const display = demandBandDisplay(resolved)
  if (!display) return null
  return (
    <span className={`tm-pr-demand-badge tm-pr-demand-${display.tone}`} title={`${display.label}${jobCount > 0 ? ` · ${jobCount} of your target jobs` : ""}`}>
      {display.label}{jobCount > 0 ? ` · ${jobCount}` : ""}
    </span>
  )
}

function GroupHeading({ text }: { text: string }) {
  return (
    <div className="tm-pr-group">
      <span className="tm-label-caps tm-pr-group-label">{text}</span>
      <span className="tm-pr-group-line" />
    </div>
  )
}

function Chevron() {
  return (
    <svg className="tm-pr-chev" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M6 4l4 4-4 4" />
    </svg>
  )
}

function OwnedRow({ skill, token, active, onPractice }: {
  skill: OwnedPracticeSkill
  token: string
  active: boolean
  onPractice: () => void
}) {
  const [open, setOpen] = useState(false)
  const { item } = skill
  const next = Math.min(item.level + 1, 5)
  const pct = Math.round((item.level / 5) * 100)
  const tier = skillTier(item.level)

  return (
    <div className={`tm-pr-row${open ? " is-open" : ""}${active ? " is-active" : ""}`} data-kind="owned">
      <div className="tm-pr-row-head" onClick={() => setOpen((v) => !v)} role="button" tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v) } }}>
        <Chevron />
        <div className="tm-pr-row-main">
          <div className="tm-pr-row-nameline">
            <span className="tm-pr-kind-dot tm-pr-dot-owned" aria-hidden />
            <span className="tm-pr-row-name">{item.display_name}</span>
            <span
              className={`tm-pr-tier tm-pr-tier-${tier}`}
              title={skillTierHint(item.level)}
              aria-label={skillTierHint(item.level)}
            >
              L{item.level} · {skillTierLabel(item.level)}
            </span>
            <DemandBadge band={skill.demandBand} jobCount={skill.jobCount} />
          </div>
          <div className="tm-pr-row-meta">
            <span className="tm-pr-mono">L{item.level} → L{skill.targetLevel}</span>
            <span>{PROFICIENCY_TITLES[item.level]} → {PROFICIENCY_TITLES[next]}</span>
            {skill.jobCount > 0 && <span>{skill.jobCount} jobs want it</span>}
          </div>
          <div className="tm-pr-row-bar"><i style={{ width: `${pct}%` }} /></div>
        </div>
        <button type="button" className="tm-pr-mini tm-control-focus" onClick={(e) => { e.stopPropagation(); onPractice() }}>
          Practice
        </button>
      </div>
      {open && (
        <div className="tm-pr-row-body">
          <InlineSkillCard skill={item} token={token} />
        </div>
      )}
    </div>
  )
}

function GapRow({ skill, active, onPractice }: {
  skill: GapPracticeSkill
  active: boolean
  onPractice: () => void
}) {
  const [open, setOpen] = useState(false)
  const ladderName = PROFICIENCY_TITLES[skill.levelTo] ?? "Trailblazer"

  return (
    <div className={`tm-pr-row${open ? " is-open" : ""}${active ? " is-active" : ""}`} data-kind="gap">
      <div className="tm-pr-row-head" onClick={() => setOpen((v) => !v)} role="button" tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v) } }}>
        <Chevron />
        <div className="tm-pr-row-main">
          <div className="tm-pr-row-nameline">
            <span className="tm-pr-kind-dot tm-pr-dot-gap" aria-hidden />
            <span className="tm-pr-row-name">{skill.skill_name}</span>
            <span className="tm-pr-tier tm-pr-tier-gap">Not on CV</span>
            <DemandBadge band={skill.demandBand} jobCount={skill.jobCount} />
          </div>
          <div className="tm-pr-row-meta">
            <span className="tm-pr-mono">L0 → L{skill.levelTo}</span>
            {skill.jobCount > 0 && <span>Wanted by {skill.jobCount} jobs</span>}
            {skill.company && <span>{skill.company}</span>}
          </div>
        </div>
        <button type="button" className="tm-pr-mini tm-control-focus" onClick={(e) => { e.stopPropagation(); onPractice() }}>
          Practice
        </button>
      </div>
      {open && (
        <div className="tm-pr-row-body tm-pr-gap-body">
          <div className="tm-pr-why-h tm-label-caps">Why this matters</div>
          {(skill.jobCount > 0 || skill.demand > 0) && (
            <div className="tm-pr-demand">
              {skill.jobCount > 0 && <>Demanded by <b>{skill.jobCount}</b> of your target jobs</>}
              {skill.jobCount > 0 && skill.demand > 0 && " · "}
              {skill.demand > 0 && <>weighted demand <b>{Math.round(skill.demand)}</b></>}
            </div>
          )}
          {skill.sources.length > 0 && (
            <div className="tm-pr-chips">
              {skill.sources.slice(0, 4).map((s) => (
                <span key={s} className="tm-pr-chip">{s}</span>
              ))}
            </div>
          )}
          <div className="tm-pr-ladder">
            Reach <b>{ladderName} (L{skill.levelTo})</b> by getting hands-on reps — then add the result to your CV.
          </div>
          <div className="tm-pr-gap-foot">
            <Link href={`/cv?skill=${encodeURIComponent(skill.skill_name)}`} className="tm-pr-addcv tm-control-focus">
              ＋ Add to your CV
            </Link>
            <span className="tm-pr-note">No CV bullet yet — add one to unlock pointer editing &amp; level appeals.</span>
          </div>
        </div>
      )}
    </div>
  )
}
