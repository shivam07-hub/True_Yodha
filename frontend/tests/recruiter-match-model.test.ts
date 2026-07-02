import assert from "node:assert/strict"
import test from "node:test"
import {
  DEFAULT_RECRUITER_BRIEF,
  computeRecruiterMatches,
  toggleSkill,
} from "@/components/b2b/recruiter-model"

test("recruiter matching stays inside the selected L2 cluster", () => {
  const matches = computeRecruiterMatches(DEFAULT_RECRUITER_BRIEF)
  assert.ok(matches.length > 0)
  assert.ok(matches.every((candidate) => candidate.l2Cluster === DEFAULT_RECRUITER_BRIEF.l2Cluster))
})

test("recruiter matching sorts stronger overlap first", () => {
  const matches = computeRecruiterMatches(DEFAULT_RECRUITER_BRIEF)
  assert.ok(matches[0].score >= matches[1].score)
  assert.ok(matches[0].overlappingSkills.length >= matches[1].overlappingSkills.length)
})

test("toggleSkill adds and removes must-have skills deterministically", () => {
  const added = toggleSkill(["SQL"], "Docker")
  assert.deepEqual(added, ["SQL", "Docker"])
  const removed = toggleSkill(added, "SQL")
  assert.deepEqual(removed, ["Docker"])
})
