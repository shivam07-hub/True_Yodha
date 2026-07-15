/** Preparations model — stage→room mapping, grouping, attention signals. */
import test from "node:test"
import assert from "node:assert/strict"
import {
  attentionCount,
  daysInStage,
  followUpLine,
  groupForList,
  liveRoomCount,
  needsStageCheck,
  roomStage,
} from "../components/preparations/prep-model"
import type { ApplicationResponse, ApplicationStatus } from "../lib/api"

const NOW = new Date("2026-07-15T12:00:00Z")

function app(status: ApplicationStatus, daysAgo: number, extra: Partial<ApplicationResponse> = {}): ApplicationResponse {
  const when = new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString()
  return {
    id: Math.floor(Math.random() * 1e6),
    job_id: `j-${status}-${daysAgo}-${Math.random().toString(36).slice(2, 6)}`,
    title: "Role",
    company: "Acme",
    status,
    source: "system_match",
    applied_at: when,
    response_at: null,
    checkin_sent_at: null,
    notes: null,
    created_at: when,
    last_stage_changed_at: when,
    ...extra,
  } as ApplicationResponse
}

test("roomStage: saved has NO room; stages and outcomes map correctly", () => {
  assert.equal(roomStage("saved"), null)
  assert.equal(roomStage("applied"), "applied")
  assert.equal(roomStage("interviewing"), "interviewing")
  assert.equal(roomStage("offer"), "closed")
  assert.equal(roomStage("rejected"), "closed")
  assert.equal(roomStage("ghosted"), "closed")
})

test("groupForList: saved filtered out; groups sorted newest first", () => {
  const older = app("applied", 9)
  const newer = app("applied", 2)
  const groups = groupForList([app("saved", 1), older, newer, app("interviewing", 3), app("rejected", 4)])
  assert.equal(groups.applied.length, 2)
  assert.equal(groups.applied[0].job_id, newer.job_id) // newest first
  assert.equal(groups.interviewing.length, 1)
  assert.equal(groups.closed.length, 1)
})

test("stage-check fires at 7d applied, not before, never on interviewing", () => {
  assert.equal(needsStageCheck(app("applied", 7), NOW), true)
  assert.equal(needsStageCheck(app("applied", 6), NOW), false)
  assert.equal(needsStageCheck(app("interviewing", 30), NOW), false)
})

test("follow-up line: day 5+, suppressed once followed up", () => {
  assert.equal(followUpLine(app("applied", 4), NOW), null)
  assert.match(followUpLine(app("applied", 5), NOW) ?? "", /follow-up/)
  assert.match(followUpLine(app("applied", 12), NOW) ?? "", /overdue/)
  assert.equal(followUpLine(app("applied", 12, { followed_up_at: NOW.toISOString() }), NOW), null)
})

test("liveRoomCount + attentionCount", () => {
  const apps = [app("saved", 1), app("applied", 8), app("interviewing", 1), app("offer", 1)]
  assert.equal(liveRoomCount(apps), 2)
  assert.equal(attentionCount(apps, NOW), 1) // only the 8d applied needs the user
})

test("daysInStage clamps garbage to 0", () => {
  assert.equal(daysInStage(app("applied", 0, { last_stage_changed_at: "not-a-date", applied_at: null, created_at: "nope" }), NOW), 0)
})
