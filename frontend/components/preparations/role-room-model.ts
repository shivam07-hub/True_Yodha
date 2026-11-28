/**
 * The target-role room — practise and prepare before any job is saved
 * (ARCHITECTURE_ONE_PREP.md P1, decision PREP1).
 *
 * A job room reads its four steps from `GET /preparations/ladder`. This room
 * has no job, so it reads the one thing that already describes the role: the
 * anchor band of `GET /career-skill-path`, which this screen already fetches.
 * Same four steps, same 0/1/2 values and the same `/8` readiness, so the rail
 * and the ring read this room exactly as they read a job room.
 *
 *   1 Evidence     the role's skills your CV or practice already shows
 *   2 Skill level  the levels the role asks, scored as `prep_ladder.level_step`
 *   3 Rehearsal    needs a job — answers are asked back from a JD
 *   4 Day-of brief needs a job
 *
 * Steps 3 and 4 stay 0 rather than borrowing a job's. "Needs a job" is true;
 * a room that cleared them without one would be claiming prep it cannot show
 * (agreed with Shivam 2026-11-28, spec §9 Q1).
 */
import type { LevelRow } from "@/lib/api"
import type { CareerSkillPath, SkillPathCard, SourceSeniority } from "@/lib/career-skill-path"

/** Reserved room id. Job ids are digits, UUIDs or hex; none is this word. */
export const ROLE_ROOM_ID = "role"
export const ROLE_ROOM_HREF = `/preparations/${ROLE_ROOM_ID}`

const NOT_STARTED = 0
const STARTED = 1
const CLEAR = 2
const MAX_ROOM_SCORE = 8

export function isRoleRoom(jobId: string | null | undefined): boolean {
  return jobId === ROLE_ROOM_ID
}

export interface RoleRoom {
  title: string
  seniority: SourceSeniority | null
  /** Live jobs at this level the skill demand was read from. */
  jobCount: number | null
  cards: SkillPathCard[]
  evidence: { answered: number; total: number }
  levels: LevelRow[]
  steps: number[]
  current_step: number
  pct: number
}

function evidenceStep(answered: number, total: number): number {
  if (total === 0 || answered === 0) return NOT_STARTED
  return answered >= total ? CLEAR : STARTED
}

/** `prep_ladder.level_step`, for the role: only skills with a drill count, and
 *  a role with nothing levelled to close reads clear, not stuck. */
function levelStep(levels: LevelRow[]): number {
  const wanted = levels.filter((row) => row.has_drill)
  if (wanted.length === 0) return CLEAR
  const met = wanted.filter((row) => row.held >= row.required).length
  if (met === wanted.length) return CLEAR
  return met > 0 || wanted.some((row) => row.held > 0) ? STARTED : NOT_STARTED
}

function levelRows(cards: SkillPathCard[]): LevelRow[] {
  const rows = cards.flatMap((card) =>
    card.required_level == null
      ? []
      : [{
          name: card.display_name,
          held: card.current_level ?? 0,
          required: card.required_level,
          has_drill: card.ladder_complete,
        }],
  )
  // `prep_ladder.level_rows`: deepest unmet ask first, met rows last.
  return rows.sort((a, b) =>
    Number(a.held >= a.required) - Number(b.held >= b.required)
    || (b.required - b.held) - (a.required - a.held),
  )
}

/** `prep_ladder.current_step`: the first step not yet clear. */
function currentStep(steps: number[]): number {
  const open = steps.findIndex((value) => value < CLEAR)
  return open === -1 ? steps.length : open + 1
}

export function roleRoom(path: CareerSkillPath | null | undefined): RoleRoom | null {
  if (!path || path.needs_target || !path.snapshot || !path.anchor) return null
  const cards = path.anchor.cards
  const answered = cards.filter((card) => card.state !== "not_evidenced").length
  const levels = levelRows(cards)
  const steps = [evidenceStep(answered, cards.length), levelStep(levels), NOT_STARTED, NOT_STARTED]
  return {
    title: path.snapshot.role_title,
    seniority: path.anchor.seniority ?? path.snapshot.seniority ?? null,
    jobCount: path.anchor.job_count,
    cards,
    evidence: { answered, total: cards.length },
    levels,
    steps,
    current_step: currentStep(steps),
    pct: Math.round((100 * steps.reduce((sum, value) => sum + value, 0)) / MAX_ROOM_SCORE),
  }
}

/** Names the steps that ARE clear. A role with nothing levelled to close has
 *  step 2 clear from the start, so "nothing cleared yet" over a 25% ring was
 *  the band contradicting its own ring. */
export function bandLine(steps: number[], current: number): string {
  const clear = steps.flatMap((value, i) => (value === CLEAR ? [i + 1] : []))
  if (current >= 3) return "Steps 1 and 2 clear — save a job to rehearse"
  if (clear.length === 0) return `Nothing cleared yet — start at step ${current} of 4`
  return `Step ${clear.join(" and ")} clear — you're on step ${current} of 4`
}
