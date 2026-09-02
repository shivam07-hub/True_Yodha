/**
 * The projection rule, on the paper side: a reword replaces exactly one line and
 * never guesses, and a remembered point finds its role by identity — because the
 * job draft and the master can hold the same roles in a different order.
 */
import test from "node:test"
import assert from "node:assert/strict"

import type { CVStructured } from "../lib/api"
import { addBulletToRole, replaceLineText, roleRefAt } from "../lib/cv/line-edit"

function cv(partial: Partial<CVStructured> = {}): CVStructured {
  return {
    summary: "Ops lead, 6 years.",
    education: [],
    experience: [
      { company: "Acme", role: "PM", dates: "2020–2023", bullets: ["Ran the migration", "Hired 4"] },
      { company: "Globex", role: "Analyst", dates: "2018–2020", bullets: ["Built the model"] },
    ],
    projects: [{ name: "Atlas", dates: "2021", bullets: ["Shipped v1"] }],
    skills_line: "SQL · Python",
    certs: ["PMP"],
    ...partial,
  } as CVStructured
}

test("replaceLineText rewrites one experience bullet and leaves the rest alone", () => {
  const next = replaceLineText(cv(), "Ran the migration", "Ran the Oracle cloud migration")
  assert.ok(next)
  assert.deepEqual(next.experience[0].bullets, ["Ran the Oracle cloud migration", "Hired 4"])
  assert.deepEqual(next.experience[1].bullets, ["Built the model"])
})

test("replaceLineText reaches summary, projects, skills line and certs", () => {
  assert.equal(replaceLineText(cv(), "Ops lead, 6 years.", "Ops lead, 7 years.")?.summary, "Ops lead, 7 years.")
  assert.deepEqual(replaceLineText(cv(), "Shipped v1", "Shipped v1 to 3k users")?.projects[0].bullets, ["Shipped v1 to 3k users"])
  assert.equal(replaceLineText(cv(), "SQL · Python", "SQL · Python · dbt")?.skills_line, "SQL · Python · dbt")
  assert.deepEqual(replaceLineText(cv(), "PMP", "PMP (2024)")?.certs, ["PMP (2024)"])
})

test("replaceLineText returns null rather than guessing which line was meant", () => {
  assert.equal(replaceLineText(cv(), "A line nobody wrote", "New"), null)
  assert.equal(replaceLineText(cv(), "Hired 4", "Hired 4"), null, "no-op edit")
  assert.equal(replaceLineText(cv(), "", "New"), null)
})

test("replaceLineText is symmetric, so the paper's undo stack can replay it", () => {
  const forward = replaceLineText(cv(), "Hired 4", "Hired 4 engineers")
  assert.ok(forward)
  const back = replaceLineText(forward, "Hired 4 engineers", "Hired 4")
  assert.deepEqual(back?.experience[0].bullets, ["Ran the migration", "Hired 4"])
})

test("replaceLineText never mutates the CV it was given", () => {
  const before = cv()
  replaceLineText(before, "Ran the migration", "Something else")
  assert.deepEqual(before.experience[0].bullets, ["Ran the migration", "Hired 4"])
})

test("addBulletToRole matches the role by identity, not by index", () => {
  const draft = cv()
  const ref = roleRefAt(draft, 1)
  assert.deepEqual(ref, { company: "Globex", role: "Analyst" })
  // The master holds the same roles in the other order — an index would land the
  // remembered point on the wrong job.
  const master = cv({ experience: [draft.experience[1], draft.experience[0]] })
  const next = addBulletToRole(master, ref!, "Cut close from 9 days to 4")
  assert.deepEqual(next.experience[0].bullets, ["Built the model", "Cut close from 9 days to 4"])
  assert.deepEqual(next.experience[1].bullets, ["Ran the migration", "Hired 4"])
})

test("addBulletToRole falls back to the last role rather than dropping the point", () => {
  const next = addBulletToRole(cv(), { company: "Initech", role: "Consultant" }, "Led the rollout")
  assert.deepEqual(next.experience[1].bullets, ["Built the model", "Led the rollout"])
})

test("addBulletToRole ignores empty text and an empty CV", () => {
  const base = cv()
  assert.deepEqual(addBulletToRole(base, { company: "Acme", role: "PM" }, "   "), base)
  const empty = cv({ experience: [] })
  assert.deepEqual(addBulletToRole(empty, { company: "Acme", role: "PM" }, "x"), empty)
})
