"use client"

import { useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { landingRoles, type LandingBand, type LandingRole } from "@/lib/api"
import { formatCount } from "@/lib/format"
import { roleLabel } from "./role-match"
import { RoleSearch } from "./role-search"

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

/** A skill reads as people say it: "Python (Programming Language)" → "Python".
 *  The bracket is the taxonomy's disambiguator, not part of the name. */
export function skillLabel(skill: string): string {
  return skill.replace(/\s*\([^)]*\)\s*$/, "") || skill
}

/** The four roles a chapter shows: the visitor's pick first, then the busiest. */
export function chapterRoles(roles: LandingRole[], picked: LandingRole | null, count = 4): LandingRole[] {
  const rest = roles.filter((role) => role.family !== picked?.family)
  return (picked ? [picked, ...rest] : rest).slice(0, count)
}

export interface RolePick {
  family: string
  band: LandingBand | null
}

/** How the visitor made a pick, for the reach of each door. */
export type PickedVia = "chip" | "search" | "level"

/** The pick as the page names it beside a dropzone: "Data Analyst · 0–2 yrs". */
export function pickLabel(pick: RolePick): string {
  return [roleLabel(pick.family), pick.band ? LEVEL_LABEL[pick.band] : null].filter(Boolean).join(" · ")
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

const offerQuery = {
  queryKey: ["landing", "roles"],
  queryFn: () => landingRoles.get(),
  staleTime: HOUR,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  retry: 1,
} as const

/** A searched family's chapters: one cached read, shared by the hero's level
 *  row and chapters 2–3. */
function roleQuery(family: string) {
  return {
    queryKey: ["landing", "role", family],
    queryFn: () => landingRoles.one(family),
    staleTime: HOUR,
    retry: 1,
  } as const
}

/** Spec #66 L1, L2b: the eight chips in full and every other family by name.
 *  One cached read per visit. */
export function useLandingOffer() {
  return useQuery(offerQuery)
}

export function useLandingRoles() {
  return useQuery({ ...offerQuery, select: (data) => data.roles })
}

/** The pick in full: a chip from the offer, a searched family from its own read. */
export function usePickedRole(family: string | undefined): LandingRole | null {
  const { data: offer } = useLandingOffer()
  const chip = offer?.roles.find((role) => role.family === family) ?? null
  const searched = useQuery({
    ...roleQuery(family ?? ""),
    enabled: !!family && !!offer && !chip,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })
  return chip ?? (family ? searched.data ?? null : null)
}

/** The four roles chapters 2 and 3 show, the pick first, chip or searched. */
export function useChapterRoles(pick: RolePick | null): LandingRole[] | null {
  const { data: roles } = useLandingRoles()
  const picked = usePickedRole(pick?.family)
  if (!roles || roles.length === 0) return null
  return chapterRoles(roles, picked)
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
  onPick: (pick: RolePick, via: PickedVia) => void
  onUnsure: () => void
}

/**
 * Role chips, a search for every other family, then the level row for the role
 * picked. A level with too few openings or employers is disabled: the market
 * is thin there, and the button says so by being unpressable, not by a
 * sentence. A searched role stands in the row as one more pressed chip. No
 * roles read → nothing renders; the hero's dropzone still works.
 */
export function RolePicker({ pick, onPick, onUnsure }: RolePickerProps) {
  const { data: offer, isPending } = useLandingOffer()
  const current = usePickedRole(pick?.family)
  const queryClient = useQueryClient()
  const pool = useMemo(() => (offer ? [...offer.roles, ...offer.more] : []), [offer])

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
  if (!offer || offer.roles.length === 0) return null

  const chips = offer.roles
  const searched = pick && !chips.some((role) => role.family === pick.family) ? pick.family : null

  /** The level picked carries to the new role when that role has a market there. */
  function keptBand(role: LandingRole): LandingBand | null {
    return pick?.band && role.bands.some((b) => b.band === pick.band && !b.thin) ? pick.band : null
  }

  function chooseSearched(family: string) {
    const chip = chips.find((role) => role.family === family)
    if (chip) {
      onPick({ family, band: keptBand(chip) }, "search")
      return
    }
    // The bands come with the family's own read. If that read fails the pick
    // still stands, without a level: the upload carries it all the same.
    queryClient.fetchQuery(roleQuery(family)).then(
      (role) => onPick({ family, band: keptBand(role) }, "search"),
      () => onPick({ family, band: null }, "search"),
    )
  }

  return (
    <div className="lp-roles">
      <p className="lp-eyebrow lp-roles-label" id="lp-roles-label">
        The job you want
      </p>
      <div className="lp-role-chips" role="group" aria-labelledby="lp-roles-label">
        {chips.map((role) => (
          <RoleChip
            key={role.family}
            family={role.family}
            pressed={role.family === pick?.family}
            onSelect={() => onPick({ family: role.family, band: keptBand(role) }, "chip")}
          />
        ))}
        {searched ? <RoleChip family={searched} pressed onSelect={() => undefined} /> : null}
        <RoleSearch pool={pool} onChoose={chooseSearched} />
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
              onClick={() => onPick({ family: current.family, band: band.band }, "level")}
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
