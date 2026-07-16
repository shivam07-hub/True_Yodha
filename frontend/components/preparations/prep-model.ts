/**
 * Preparations model — pure view-model both the list and the room read
 * (collections/model.ts pattern: one source, skins can't drift).
 *
 * Grill locks 2026-07-15 (memory: project_preparations_surface):
 * a room exists from `applied`; `interviewing` adds the rehearse/drill/brief
 * layer; outcomes (parallel terminal set) flip it to closing mode. Saved jobs
 * NEVER appear here — Collections owns pre-apply.
 */
import type { ApplicationResponse, ApplicationStatus } from "@/lib/api"
import { APPLICATION_OUTCOMES } from "@/lib/api"

export type RoomStage = "applied" | "interviewing" | "closed"

/** Days the application has sat in its current stage (created_at fallback). */
export function daysInStage(app: ApplicationResponse, now: Date): number {
  const since = app.last_stage_changed_at ?? app.applied_at ?? app.created_at
  const t = new Date(since).getTime()
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000))
}

/** Which room an application renders. `null` = no room (saved lives in Collections). */
export function roomStage(status: ApplicationStatus): RoomStage | null {
  if (status === "applied") return "applied"
  if (status === "interviewing") return "interviewing"
  if ((APPLICATION_OUTCOMES as readonly string[]).includes(status)) return "closed"
  return null
}

/** The quiet inline stage-check: an applied room 7d+ without a stage change. */
export function needsStageCheck(app: ApplicationResponse, now: Date): boolean {
  return app.status === "applied" && daysInStage(app, now) >= 7
}

/** Follow-up nudge copy for the applied room — null before day 5. */
export function followUpLine(app: ApplicationResponse, now: Date): string | null {
  const days = daysInStage(app, now)
  if (app.status !== "applied" || days < 5) return null
  if (app.followed_up_at) return null
  return days >= 10
    ? `Applied ${days} days ago — a polite nudge is overdue.`
    : `Applied ${days} days ago — a follow-up lands well this week.`
}

export interface PrepGroups {
  interviewing: ApplicationResponse[]
  applied: ApplicationResponse[]
  closed: ApplicationResponse[]
}

/** Stage-grouped list. Interviewing first (hottest), newest stage-change first
 *  within a group. Saved is filtered out entirely. */
export function groupForList(apps: ApplicationResponse[]): PrepGroups {
  const recency = (a: ApplicationResponse) =>
    new Date(a.last_stage_changed_at ?? a.applied_at ?? a.created_at).getTime() || 0
  const pick = (stage: RoomStage) =>
    apps
      .filter((a) => roomStage(a.status) === stage)
      .sort((a, b) => recency(b) - recency(a))
  return {
    interviewing: pick("interviewing"),
    applied: pick("applied"),
    closed: pick("closed"),
  }
}

/** Live rooms = the nav Prep tab count and the list headline. */
export function liveRoomCount(apps: ApplicationResponse[]): number {
  return apps.filter((a) => a.status === "applied" || a.status === "interviewing").length
}

/** "Rooms needing you" — the nav pill count: overdue stage-checks + follow-ups
 *  due. Gap counts need per-room coverage fetches, so they intentionally don't
 *  feed the pill (grill Q8: ride existing cheap signals only). */
export function attentionCount(apps: ApplicationResponse[], now: Date): number {
  return apps.filter((a) => needsStageCheck(a, now) || followUpLine(a, now) !== null).length
}
