import { strict as assert } from "node:assert"
import { test } from "node:test"
import { JOB_PLAN_ORDER, jobPlanSections } from "../lib/jobs/detail-model"

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
