/* Upskilling home — "next set" hero, optional gap-assessment entry, skill list.
   Consumes the merged LadderSkill model (backend progress + buildPracticeSkills
   demand). The gap entry is rendered only when a target job is supplied
   (Surface B / Slice 5). */

"use client"

import { useState, type JSX } from "react"
import type { DemandBand } from "@/lib/api"
import { Icon } from "./icons"
import { LevelLadder } from "./primitives"
import { DEMAND_LABEL, DEMAND_RANK, PROFICIENCY, tierLabel, tierOf } from "./proficiency"
import type { LadderSkill } from "./types"

function DemandTag({ demand, jobCount }: { demand: DemandBand; jobCount: number }): JSX.Element | null {
  if (!demand || demand === "none") return null
  const hot = demand === "very_high" || demand === "high"
  return (
    <span className="up-demand" title={`${DEMAND_LABEL[demand]} · wanted by ${jobCount} of your target jobs`}>
      {hot && <span className="flame"><Icon name="flame" size={12} /></span>}
      {DEMAND_LABEL[demand]} · {jobCount} jobs
    </span>
  )
}

/* The single highest-leverage next action — minimum-clicks entry. */
function NextSetHero({ skill, onStart }: { skill: LadderSkill; onStart: (skill: LadderSkill, level: number) => void }): JSX.Element {
  const next = Math.min(skill.clearedLevel + 1, 5)
  const titleNext = PROFICIENCY[next]
  return (
    <section className="up-card up-hero" aria-label="Recommended next set">
      <div className="up-hero-l">
        <div className="up-hero-kicker">
          <span className="up-hero-pulse" aria-hidden="true" />
          <span className="up-label">Your next set</span>
        </div>
        <h2 className="up-hero-name">{skill.name} · Level {next}</h2>
        <p className="up-hero-meta">
          Clear the <b>{titleNext} (L{next})</b> set — 10 questions, untimed. Pass <b>8/10</b> to bank tokens and unlock L{Math.min(next + 1, 5)}.
        </p>
        <div className="up-hero-laddwrap">
          <LevelLadder clearedLevel={skill.clearedLevel} maxBankLevel={skill.maxBankLevel} onStart={(lvl) => onStart(skill, lvl)} />
          <div className="up-ladder-cap"><span>L1 {PROFICIENCY[1]}</span><span>L5 {PROFICIENCY[5]}</span></div>
        </div>
      </div>
      <div className="up-hero-r">
        <button type="button" className="up-btn up-btn-primary up-hero-cta" onClick={() => onStart(skill, next)}>
          <Icon name="bolt" size={16} /> Start set · L{next}
        </button>
        <div className="up-hero-tiers">
          <Icon name="coin" size={13} /> +50 / +30 / +20 by score
        </div>
      </div>
    </section>
  )
}

export function GapEntryCard({ job, onAssess }: { job: { title: string; company: string }; onAssess: () => void }): JSX.Element {
  return (
    <section className="up-card up-gapcard" aria-label="Skill-gap assessment">
      <div className="up-gapcard-ic" aria-hidden="true"><Icon name="target" size={22} /></div>
      <div className="up-gapcard-body">
        <h3>Assess my readiness for a job</h3>
        <p>Take a short calibration across the gap skills for <span className="up-gapcard-job">{job.title} · {job.company}</span> and get a readiness map — no guessing what to practice.</p>
      </div>
      <button type="button" className="up-btn up-btn-outline up-gapcard-cta" onClick={onAssess}>
        <Icon name="target" size={15} /> Assess readiness
      </button>
    </section>
  )
}

function SkillCard({ skill, active, onStart }: { skill: LadderSkill; active: boolean; onStart: (skill: LadderSkill, level: number) => void }): JSX.Element {
  const next = Math.min(skill.clearedLevel + 1, 5)
  const t = tierOf(skill.clearedLevel)
  const maxed = skill.clearedLevel >= 5
  const showAssessed = skill.assessedLevel > 0
  return (
    <article className={`up-card up-skill${active ? " is-active" : ""}`}>
      <div className="up-skill-top">
        <div className="up-skill-id">
          <div className="up-skill-nameline">
            <span className="up-skill-name">{skill.name}</span>
            {showAssessed
              ? <span className="up-badge up-badge-assessed"><Icon name="check" size={11} /> Assessed L{skill.assessedLevel}</span>
              : <span className={`up-badge up-badge-${t}`}>L{skill.clearedLevel} · {tierLabel(skill.clearedLevel)}</span>}
            {!skill.onCV && <span className="up-badge up-badge-notcv">Not on CV</span>}
          </div>
          <div className="up-skill-meta">
            <DemandTag demand={skill.demand} jobCount={skill.jobCount} />
          </div>
        </div>
      </div>

      <div className="up-skill-ladderrow">
        <div className="ladd">
          <LevelLadder clearedLevel={skill.clearedLevel} maxBankLevel={skill.maxBankLevel} onStart={(lvl) => onStart(skill, lvl)} compact />
        </div>
        <div className="up-skill-cta">
          {maxed ? (
            <span className="up-band up-band-ready"><Icon name="star" size={13} /> Legend · all cleared</span>
          ) : (
            <button type="button" className="up-btn up-btn-primary up-btn-sm" onClick={() => onStart(skill, next)}>
              <Icon name="bolt" size={14} /> Start set · L{next}
            </button>
          )}
        </div>
      </div>

      <div className="up-skill-foot">
        <span className="up-skill-wayfind">
          {maxed ? "Re-clear any level anytime for mastery (earns 0 — already banked)."
            : skill.clearedLevel === 0 ? `Clear L1 ${PROFICIENCY[1]} to begin the ladder.`
              : `${skill.clearedLevel}/5 cleared · next unlocks ${PROFICIENCY[next]} (L${next}).`}
        </span>
      </div>
    </article>
  )
}

type SortMode = "default" | "demand"

export function SkillList({
  skills,
  activeKey,
  onStart,
}: {
  skills: LadderSkill[]
  activeKey: string | null
  onStart: (skill: LadderSkill, level: number) => void
}): JSX.Element {
  const [sort, setSort] = useState<SortMode>("default")
  const ranked = [...skills].sort((a, b) => {
    if (sort === "demand") {
      const d = (DEMAND_RANK[b.demand] - DEMAND_RANK[a.demand]) || (b.jobCount - a.jobCount)
      if (d) return d
    }
    if (a.clearedLevel !== b.clearedLevel) return a.clearedLevel - b.clearedLevel
    return DEMAND_RANK[b.demand] - DEMAND_RANK[a.demand]
  })
  const onCV = ranked.filter((s) => s.onCV)
  const gaps = ranked.filter((s) => !s.onCV)
  return (
    <section className="up-skilllist">
      <div className="up-section-head">
        <div>
          <h2>Your skills</h2>
          <div className="up-section-sub">{onCV.length} on your CV · {gaps.length} from target jobs</div>
        </div>
        <div className="up-seg-tabs" role="group" aria-label="Sort skills">
          <button type="button" className="up-seg-tab" aria-pressed={sort === "default"} onClick={() => setSort("default")}>Quick wins</button>
          <button type="button" className="up-seg-tab" aria-pressed={sort === "demand"} onClick={() => setSort("demand")}><Icon name="flame" size={12} /> Hottest</button>
        </div>
      </div>

      <div className="up-rows">
        {onCV.map((s) => (
          <SkillCard key={s.key} skill={s} active={s.key === activeKey} onStart={onStart} />
        ))}
        {gaps.length > 0 && (
          <div className="up-grouplbl"><span className="up-label">Gaps from target jobs — practice, then add to CV</span><span className="ln" /></div>
        )}
        {gaps.map((s) => (
          <SkillCard key={s.key} skill={s} active={s.key === activeKey} onStart={onStart} />
        ))}
      </div>
    </section>
  )
}

export { NextSetHero }
