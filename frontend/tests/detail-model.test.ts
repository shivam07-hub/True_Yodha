import { strict as assert } from "node:assert"
import { test } from "node:test"
import { JOB_PLAN_ORDER, jobPlanSections, livenessNotice } from "../lib/jobs/detail-model"

test("full-data desktop render follows the funnel order", () => {
  const sections = jobPlanSections({
    hasWhy: true,
    matchedCount: 2,
    buildCount: 3,
    hasJd: true,
    hasCompany: true,
  })
  assert.deepEqual(sections, ["why", "skills", "reach", "jd", "company", "notes"])
  assert.deepEqual(sections, [...JOB_PLAN_ORDER])
})

test("empty skill data drops the skills slot entirely (no dead section)", () => {
  const sections = jobPlanSections({
    hasWhy: true,
    matchedCount: 0,
    buildCount: 0,
    hasJd: true,
    hasCompany: true,
  })
  assert.ok(!sections.includes("skills"))
})

test("loading keeps the skills slot mounted for its spinner", () => {
  const sections = jobPlanSections({
    hasWhy: true,
    matchedCount: 0,
    buildCount: 0,
    loadingSkills: true,
  })
  assert.ok(sections.includes("skills"))
})

test("mobile subset — unsupported slots never render, order preserved", () => {
  const sections = jobPlanSections({
    hasWhy: true,
    matchedCount: 1,
    buildCount: 6,
    supports: { reach: false, jd: false, company: false, notes: false },
  })
  assert.deepEqual(sections, ["why", "skills"])
})

test("missing company and JD gate their sections", () => {
  const sections = jobPlanSections({
    hasWhy: false,
    matchedCount: 1,
    buildCount: 0,
    hasJd: false,
    hasCompany: false,
  })
  assert.deepEqual(sections, ["skills", "reach", "notes"])
})

test("a closed listing is the only state loud enough to guard Apply", () => {
  const closed = livenessNotice("closed")
  assert.equal(closed?.tone, "warn")
  assert.equal(closed?.guardsApply, true)

  for (const state of ["live", "unknown", "unverified"] as const) {
    const notice = livenessNotice(state)
    assert.equal(notice?.tone, "quiet", `${state} must stay quiet`)
    assert.equal(notice?.guardsApply, false, `${state} must never block Apply`)
  }
})

test("a failed check reads as 'couldn't check', never as closed", () => {
  // An ATS blocking our verifier is not evidence the role is gone. If this ever
  // starts implying closure, we are lying to users about their own shortlist.
  const unknown = livenessNotice("unknown")
  assert.match(unknown!.text, /couldn't check/i)
  assert.doesNotMatch(unknown!.text, /closed/i)
})

test("an unchecked listing is disclosed, not implied live", () => {
  const unverified = livenessNotice("unverified")
  assert.match(unverified!.text, /not yet checked/i)
  assert.doesNotMatch(unverified!.text, /live/i)
})

test("a live verdict carries when we last saw it", () => {
  assert.match(livenessNotice("live", { relativeAge: "2 hours ago" })!.text, /2 hours ago/)
  // No stamp is still a valid verdict — just without the age clause.
  assert.match(livenessNotice("live")!.text, /confirmed live$/)
})

test("no verdict renders nothing at all", () => {
  assert.equal(livenessNotice(null), null)
  assert.equal(livenessNotice(undefined), null)
})
