import test from "node:test"
import assert from "node:assert/strict"

import { mentorRewriteHref, practiceHref } from "../lib/practice-mentor-handoff"

test("job-origin practice preserves the job for the return handoff", () => {
  assert.equal(practiceHref("SQL", "job/42"), "/practice?skill=SQL&jobId=job%2F42")
  assert.equal(practiceHref("SQL"), "/practice?skill=SQL")
})

test("job-linked practice returns to that job's existing Mentor weave", () => {
  assert.equal(
    mentorRewriteHref({ skill: "Stakeholder Management", jobId: "job/42", hasCvEvidence: true }),
    "/cv?jobId=job%2F42&skill=Stakeholder+Management&mentor=1",
  )
})

test("generic practice opens the evidence-backed Main CV Mentor", () => {
  assert.equal(
    mentorRewriteHref({ skill: "SQL", jobId: null, hasCvEvidence: true }),
    "/cv?edit=1&skill=SQL&mentor=1",
  )
})

test("practice alone never authorizes a CV claim without existing evidence", () => {
  assert.equal(
    mentorRewriteHref({ skill: "SQL", jobId: "job-42", hasCvEvidence: false }),
    null,
  )
  assert.equal(mentorRewriteHref({ skill: "  ", jobId: null, hasCvEvidence: true }), null)
})
