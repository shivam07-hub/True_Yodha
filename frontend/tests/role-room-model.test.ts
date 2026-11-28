import test from "node:test"
import assert from "node:assert/strict"
import { bandLine, isRoleRoom, roleRoom, ROLE_ROOM_HREF, ROLE_ROOM_ID } from "../components/preparations/role-room-model"
import { roomFromUrl } from "../components/preparations/prep-model"
import type { CareerSkillPath, SkillPathCard } from "../lib/career-skill-path"

function card(name: string, extra: Partial<SkillPathCard> = {}): SkillPathCard {
  return {
    skill_id: 1,
    taxonomy_key: name,
    display_name: name,
    state: "not_evidenced",
    current_level: null,
    required_level: 3,
    evidence_pointer: null,
    demand: { kind: "core", skill_job_count: 10, band_job_count: 40 },
    ladder_complete: true,
    certificate_status: "none",
    verification_id: null,
    next_practice_level: 1,
    request_status: "none",
    ...extra,
  } as SkillPathCard
}

function path(cards: SkillPathCard[], extra: Partial<CareerSkillPath> = {}): CareerSkillPath {
  return {
    needs_target: false,
    missing: null,
    snapshot: {
      id: "s1",
      role_title: "Product Analyst",
      career_area: null,
      role_family: "Product Management",
      seniority: "entry",
      locations: [],
      cv_baseline_id: 1,
      created_at: null,
    },
    lower: null,
    anchor: { kind: "anchor", seniority: "entry", job_count: 412, cards },
    higher: null,
    training: [],
    next_action: null,
    target_flow: null,
    ...extra,
  } as CareerSkillPath
}

test("the target-role room has its own address in the room URL", () => {
  assert.equal(ROLE_ROOM_HREF, `/preparations/${ROLE_ROOM_ID}`)
  assert.deepEqual(roomFromUrl(ROLE_ROOM_HREF, "step=2"), { jobId: ROLE_ROOM_ID, step: 2 })
  assert.equal(isRoleRoom(ROLE_ROOM_ID), true)
  assert.equal(isRoleRoom("137440"), false)
  assert.equal(isRoleRoom(null), false)
})

test("no room without a target role or a band to read", () => {
  assert.equal(roleRoom(undefined), null)
  assert.equal(roleRoom(path([card("SQL")], { needs_target: true })), null)
  assert.equal(roleRoom(path([card("SQL")], { anchor: null })), null)
  assert.equal(roleRoom(path([card("SQL")], { snapshot: null })), null)
})

test("step 1 counts the role's skills the CV or practice already shows", () => {
  const room = roleRoom(path([
    card("SQL", { state: "on_cv", current_level: 2 }),
    card("KPIs", { state: "practised", current_level: 1 }),
    card("Excel"),
  ]))!
  assert.deepEqual(room.evidence, { answered: 2, total: 3 })
  assert.equal(room.steps[0], 1)
  const all = roleRoom(path([card("SQL", { state: "on_cv", current_level: 3 })]))!
  assert.equal(all.steps[0], 2)
  const none = roleRoom(path([card("SQL")]))!
  assert.equal(none.steps[0], 0)
})

test("step 2 scores levels the way a job room does, deepest gap first", () => {
  const room = roleRoom(path([
    card("SQL", { state: "on_cv", current_level: 3, required_level: 3 }),
    card("KPIs", { state: "practised", current_level: 1, required_level: 4 }),
    card("Excel", { required_level: 2 }),
    // No ladder: shown, but it cannot hold the step at not-started.
    card("Vendor Mgmt", { ladder_complete: false, next_practice_level: null, required_level: 3 }),
    // No asked level: not a rung row at all.
    card("Teamwork", { required_level: null }),
  ]))!
  assert.deepEqual(room.levels.map((r) => r.name), ["KPIs", "Vendor Mgmt", "Excel", "SQL"])
  assert.deepEqual(room.levels.find((r) => r.name === "KPIs"), { name: "KPIs", held: 1, required: 4, has_drill: true })
  assert.equal(room.levels.find((r) => r.name === "Vendor Mgmt")!.has_drill, false)
  assert.equal(room.steps[1], 1)
  const met = roleRoom(path([card("SQL", { state: "on_cv", current_level: 3 })]))!
  assert.equal(met.steps[1], 2)
  const nothing = roleRoom(path([card("Excel")]))!
  assert.equal(nothing.steps[1], 0)
  // Nothing levelled to close reads clear, as a job room's step 2 does.
  const unlevelled = roleRoom(path([card("Teamwork", { required_level: null })]))!
  assert.equal(unlevelled.steps[1], 2)
})

test("rehearsal and the brief need a job, so they stay at zero", () => {
  const room = roleRoom(path([card("SQL", { state: "on_cv", current_level: 3 })]))!
  assert.deepEqual(room.steps, [2, 2, 0, 0])
  assert.equal(room.current_step, 3)
  assert.equal(room.pct, 50)
  const fresh = roleRoom(path([card("Excel")]))!
  assert.equal(fresh.current_step, 1)
  assert.equal(fresh.pct, 0)
})

test("the head names the role, its level and how many live jobs read into it", () => {
  const room = roleRoom(path([card("SQL")]))!
  assert.equal(room.title, "Product Analyst")
  assert.equal(room.seniority, "entry")
  assert.equal(room.jobCount, 412)
})

test("the band names the steps that are clear, never 'nothing' over a filled ring", () => {
  assert.equal(bandLine([0, 0, 0, 0], 1), "Nothing cleared yet — start at step 1 of 4")
  // A role with nothing levelled to close: step 2 clear from the start.
  assert.equal(bandLine([0, 2, 0, 0], 1), "Step 2 clear — you're on step 1 of 4")
  assert.equal(bandLine([2, 1, 0, 0], 2), "Step 1 clear — you're on step 2 of 4")
  assert.equal(bandLine([2, 2, 0, 0], 3), "Steps 1 and 2 clear — save a job to rehearse")
})
