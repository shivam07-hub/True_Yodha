"use client"

import { useState, type CSSProperties } from "react"
import { formatCount } from "@/lib/format"
import { SectionTitle } from "./section-title"
import {
  LEVEL_LABEL,
  RoleChip,
  chapterRoles,
  roleLabel,
  skillLabel,
  useLandingRoles,
  type RolePick,
} from "./role-picker"

interface LandingRoleSkillsProps {
  pick: RolePick | null
}

/**
 * Spec #66 chapter 3: what employers ask for, per role, at the level the
 * visitor picked in the hero. A level the snapshot marks thin has no skills of
 * its own, so the chapter reads that role across all levels and says so in the
 * meta line. Each share is the fraction of the slice's openings asking for it.
 */
export function LandingRoleSkills({ pick }: LandingRoleSkillsProps) {
  const { data: roles } = useLandingRoles()
  const [chosen, setChosen] = useState<string | null>(null)
  if (!roles || roles.length === 0) return null

  const shown = chapterRoles(roles, pick?.family)
  const active =
    shown.find((role) => role.family === chosen) ??
    shown.find((role) => role.family === pick?.family) ??
    shown[0]
  const band = pick?.band
    ? active.bands.find((item) => item.band === pick.band && !item.thin)
    : undefined
  const skills = band ? band.skills : active.skills
  const jobs = band ? band.jobs : active.jobs
  const companies = band ? band.companies : active.companies
  const level = band ? LEVEL_LABEL[band.band] : "All levels"

  return (
    <section className="lp-chapter" data-bridge-step aria-label="Skills by role">
      <div className="lp-wrap">
        <div className="lp-section-head">
          <SectionTitle>Skills top companies hire for</SectionTitle>
        </div>

        <div className="lp-role-chips" role="group" aria-label="Role">
          {shown.map((role) => (
            <RoleChip
              key={role.family}
              family={role.family}
              pressed={role.family === active.family}
              onSelect={() => setChosen(role.family)}
            />
          ))}
        </div>

        <ul className="lp-skill-rows" aria-label={`Skills for ${roleLabel(active.family)}, ${level}`}>
          {skills.map((skill) => (
            <li key={skill.skill} className="lp-skill-row">
              <span className="lp-skill-name" title={skill.skill}>
                {skillLabel(skill.skill)}
              </span>
              <span
                className="lp-bar"
                aria-hidden="true"
                style={{ "--lp-bar-fill": `${skill.share * 100}%` } as CSSProperties}
              />
              <span className="lp-skill-share">{Math.round(skill.share * 100)}%</span>
            </li>
          ))}
        </ul>

        <p className="lp-chapter-meta">
          {level} · from {formatCount(jobs)} live jobs at {formatCount(companies)} companies
        </p>
      </div>
    </section>
  )
}
