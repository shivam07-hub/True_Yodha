import test from "node:test"
import assert from "node:assert/strict"

import { cvUpgradeHref, practiceHref } from "../lib/practice-mentor-handoff"

test("job-origin practice preserves the job for the return handoff", () => {
  assert.equal(practiceHref("SQL", "job/42"), "/practice?skill=SQL&jobId=job%2F42")
  assert.equal(practiceHref("SQL"), "/practice?skill=SQL")
})

test("job-linked practice updates the living Main CV, not a job-specific copy", () => {
  assert.equal(
    cvUpgradeHref({ skill: "Stakeholder Management", hasCvEvidence: true }),
    "/cv?edit=1&skill=Stakeholder+Management&mentor=1",
  )
})

test("generic practice opens the evidence-backed Main CV Mentor", () => {
  assert.equal(
    cvUpgradeHref({ skill: "SQL", hasCvEvidence: true }),
    "/cv?edit=1&skill=SQL&mentor=1",
  )
})

test("practice-only proof opens the Main CV skills refresh without fabricating a bullet", () => {
  assert.equal(
    cvUpgradeHref({ skill: "SQL", hasCvEvidence: false }),
    "/cv?edit=1&skill=SQL&tab=skills&addProven=1",
  )
  assert.equal(cvUpgradeHref({ skill: "  ", hasCvEvidence: true }), null)
})
