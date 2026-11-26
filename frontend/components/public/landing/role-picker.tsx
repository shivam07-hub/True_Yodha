"use client"

import { useQuery } from "@tanstack/react-query"
import { landingRoles, type LandingBand, type LandingRole } from "@/lib/api"
import { formatCount } from "@/lib/format"

const HOUR = 60 * 60 * 1000
const SKELETON_CHIPS = 8

/** The six bands, as a person says their experience. Order and keys are the
 *  backend's `PERSON_YEAR_SPAN_BY_BAND`. */
export const LEVEL_LABEL: Record<LandingBand, string> = {
  intern: "Internship",
  entry: "0–2 yrs",
  mid: "2–5 yrs",
  senior: "5–8 yrs",
  lead: "8–12 yrs",
  executive: "12+ yrs",
}

/** A chip holds the name people say: "Artificial Intelligence and Machine
 *  Learning (AI/ML)" → "AI/ML". */
export function roleLabel(family: string): string {
  const short = family.match(/\(([^)]+)\)\s*$/)
  return short ? short[1] : family
}

/** A skill reads as people say it: "Python (Programming Language)" → "Python".
 *  The bracket is the taxonomy's disambiguator, not part of the name. */
export function skillLabel(skill: string): string {
  return skill.replace(/\s*\([^)]*\)\s*$/, "") || skill
}

/** The four roles a chapter shows: the visitor's pick first, then the busiest. */
export function chapterRoles(roles: LandingRole[], picked: string | undefined, count = 4): LandingRole[] {
  const first = roles.find((role) => role.family === picked)
  const rest = roles.filter((role) => role !== first)
  return (first ? [first, ...rest] : rest).slice(0, count)
}

export interface RolePick {
  family: string
  band: LandingBand | null
}

/** Where an upload lands, carrying the job the visitor picked so the first
 *  screen after the score can read their CV against it (spec #66 Q8, L7).
 *  Every upload on the landing uses this, so the pick rides whichever one
 *  they press. */
export function uploadDestination(pick: RolePick | null): string {
  if (!pick) return "/cv-preview"
  const params = new URLSearchParams({ role: pick.family })
  if (pick.band) params.set("level", pick.band)
  return `/cv-preview?${params.toString()}`
}

/** Spec #66 L1: the market snapshot's eight roles. One cached read per visit. */
export function useLandingRoles() {
  return useQuery({
    queryKey: ["landing", "roles"],
    queryFn: () => landingRoles.get(),
    select: (data) => data.roles,
    staleTime: HOUR,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

/** One role chip, pressed when it is the role in view. The hero's picker and
 *  chapter 3's role switch are the same control, so they share this. */
export function RoleChip({
  family,
  pressed,
  onSelect,
}: {
  family: string
  pressed: boolean
  onSelect: () => void
}) {
  return (
    <button type="button" className="lp-role-chip" aria-pressed={pressed} title={family} onClick={onSelect}>
      {roleLabel(family)}
    </button>
  )
}

interface RolePickerProps {
  pick: RolePick | null
  onPick: (pick: RolePick) => void
  onUnsure: () => void
}

/**
 * Role chips, then the level row for the role picked. A level with too few
 * openings or employers is disabled: the market is thin there, and the button
 * says so by being unpressable, not by a sentence. No roles read → nothing
 * renders; the hero's dropzone still works.
 */
export function RolePicker({ pick, onPick, onUnsure }: RolePickerProps) {
  const { data: roles, isPending } = useLandingRoles()

  if (isPending) {
    return (
      <div className="lp-roles" aria-hidden="true">
        <div className="lp-role-chips">
          {Array.from({ length: SKELETON_CHIPS }, (_, i) => (
            <span key={i} className="lp-role-chip is-skel" />
          ))}
        </div>
      </div>
    )
  }
  if (!roles || roles.length === 0) return null

  const current = roles.find((role) => role.family === pick?.family) ?? null

  function chooseRole(role: LandingRole) {
    const keep = pick?.band && role.bands.some((b) => b.band === pick.band && !b.thin)
    onPick({ family: role.family, band: keep ? pick?.band ?? null : null })
  }

  return (
    <div className="lp-roles">
      <p className="lp-eyebrow lp-roles-label" id="lp-roles-label">
        The job you want
      </p>
      <div className="lp-role-chips" role="group" aria-labelledby="lp-roles-label">
        {roles.map((role) => (
          <RoleChip
            key={role.family}
            family={role.family}
            pressed={role.family === pick?.family}
            onSelect={() => chooseRole(role)}
          />
        ))}
        <button type="button" className="lp-role-unsure" onClick={onUnsure}>
          Not sure? Upload
        </button>
      </div>

      {current && (
        <div className="lp-levels" role="group" aria-label={`Experience for ${roleLabel(current.family)}`}>
          {current.bands.map((band) => (
            <button
              key={band.band}
              type="button"
              className="lp-level"
              aria-pressed={pick?.band === band.band}
              disabled={band.thin}
              onClick={() => onPick({ family: current.family, band: band.band })}
            >
              <span className="lp-level-name">{LEVEL_LABEL[band.band]}</span>
              <span className="lp-level-count">{formatCount(band.jobs)} jobs</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
