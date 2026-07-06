import assert from "node:assert/strict"
import { test } from "node:test"

import type { JobMatch } from "../lib/api"
import { pickBestMatch, strongMatches, verdictLabel } from "../lib/jobs/match-verdict"

function job(over: Partial<JobMatch>): JobMatch {
  return { match_score: 50, verdict: "worth_it", is_strong: false, ...over } as JobMatch
}

test("strongMatches keeps only verdict==strong", () => {
  const jobs = [
    job({ job_id: "a", is_strong: true }),
    job({ job_id: "b", is_strong: false }),
  ]
  assert.deepEqual(strongMatches(jobs).map((j) => j.job_id), ["a"])
})

test("pickBestMatch prefers the highest-scoring strong match", () => {
  const jobs = [
    job({ job_id: "weak-strong", is_strong: true, match_score: 62 }),
    job({ job_id: "top-strong", is_strong: true, match_score: 88 }),
    job({ job_id: "high-nonstrong", is_strong: false, match_score: 95 }),
  ]
  assert.equal(pickBestMatch(jobs)?.job_id, "top-strong")
})

test("pickBestMatch never returns an empty hand — closest by score when no strong", () => {
  const jobs = [
    job({ job_id: "closest", is_strong: false, match_score: 48 }),
    job({ job_id: "farther", is_strong: false, match_score: 33 }),
  ]
  assert.equal(pickBestMatch(jobs)?.job_id, "closest")
})

test("pickBestMatch returns null only with no matches", () => {
  assert.equal(pickBestMatch([]), null)
})

test("verdict presentation: every verdict has a non-empty label", () => {
  for (const v of ["strong", "worth_it", "stretch", "checking"] as const) {
    assert.ok(verdictLabel(v).length > 0)
  }
  assert.equal(verdictLabel("worth_it"), "Worth it")
})
