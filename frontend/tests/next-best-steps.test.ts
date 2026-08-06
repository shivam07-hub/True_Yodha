import test from "node:test"
import assert from "node:assert/strict"

import { deriveNextBestSteps, type NextStepsInput } from "../lib/onboarding/next-best-steps"
import type { GapSkill } from "../lib/api"

function gap(over: Partial<GapSkill>): GapSkill {
  return {
    skill: "Python",
    current_level: 1,
    target_level: 3,
    gap_score: 0.5,
    job_count_30d: 10,
    why_it_matters: "",
    ...over,
  }
}

const FULL: NextStepsInput = {
  score: 42,
  gapSkills: [
    gap({ skill: "Python", gap_score: 0.4, job_count_30d: 12 }),
    gap({ skill: "SQL", gap_score: 0.9, job_count_30d: 3 }),
    gap({ skill: "Docker", gap_score: 0.9, job_count_30d: 30 }),
  ],
  domainScores: { SD: 70, DE: 22, OPS: 55 },
  bestJob: { jobId: "job-1", title: "Data Engineer", company: "Acme", fit: 88 },
  tailorJobId: "job-1",
}

test("returns the three impact-ranked roles in order", () => {
  const steps = deriveNextBestSteps(FULL)
  assert.equal(steps.length, 3)
  assert.deepEqual(steps.map((s) => s.kind), ["skill", "job", "cv"])
  assert.deepEqual(steps.map((s) => s.rank), [1, 2, 3])
})

test("step 1 picks the highest gap_score, breaking ties on job_count_30d", () => {
  const steps = deriveNextBestSteps(FULL)
  // SQL and Docker tie on gap_score 0.9; Docker wins on job_count_30d.
  assert.equal(steps[0].title, "Practice Docker")
  assert.equal(steps[0].href, "/practice?skill=Docker")
})

test("step 2 routes to the best-fit job detail and names it", () => {
  const steps = deriveNextBestSteps(FULL)
  assert.equal(steps[1].href, "/home?jobId=job-1")
  assert.match(steps[1].title, /Data Engineer at Acme/)
  assert.match(steps[1].detail, /88% fit/)
})

test("step 3 targets the lowest-scoring domain and tailors the CV", () => {
  const steps = deriveNextBestSteps(FULL)
  assert.equal(steps[2].href, "/cv?jobId=job-1")
  assert.match(steps[2].title, /Data Engineering/) // DE = 22, lowest
  assert.match(steps[2].detail, /22%/)
})

test("no score yet → empty (FirstRunHero owns that moment)", () => {
  assert.deepEqual(deriveNextBestSteps({ ...FULL, score: 0 }), [])
})

test("no gaps falls back to weakest-domain practice", () => {
  const steps = deriveNextBestSteps({ ...FULL, gapSkills: [] })
  assert.equal(steps[0].kind, "skill")
  assert.equal(steps[0].href, "/practice")
  assert.match(steps[0].title, /Data Engineering/)
})

test("no jobs falls back to the market browse CTA", () => {
  const steps = deriveNextBestSteps({ ...FULL, bestJob: null })
  assert.equal(steps[1].href, "/market")
  assert.equal(steps[1].cta, "Browse jobs")
})

test("no tailor job id → plain /cv deep-link", () => {
  const steps = deriveNextBestSteps({ ...FULL, tailorJobId: null })
  assert.equal(steps[2].href, "/cv")
})

test("low score still produces a motivating three-move plan", () => {
  const steps = deriveNextBestSteps({ ...FULL, score: 8 })
  assert.equal(steps.length, 3)
  assert.doesNotMatch(steps.map((s) => s.detail).join(" "), /missing|fail|weak/i)
})

test("singular job count reads 'job', not 'jobs'", () => {
  const steps = deriveNextBestSteps({
    ...FULL,
    gapSkills: [gap({ skill: "Rust", gap_score: 1, job_count_30d: 1 })],
  })
  assert.match(steps[0].detail, /1 recent job\b/)
})

test("skill step carries the honest projected point-gain (T2-3)", () => {
  const steps = deriveNextBestSteps({
    ...FULL,
    gapSkills: [gap({ skill: "Rust", gap_score: 1, job_count_30d: 5, score_delta: 6.4 })],
  })
  assert.equal(steps[0].gain, 6) // rounded whole points
})

test("a sub-point gain is suppressed, never shown as a misleading chip", () => {
  const steps = deriveNextBestSteps({
    ...FULL,
    gapSkills: [gap({ skill: "Rust", gap_score: 1, job_count_30d: 5, score_delta: 0.4 })],
  })
  assert.equal(steps[0].gain, undefined)
})

test("missing score_delta (pre-recompute) → no gain, no crash", () => {
  const steps = deriveNextBestSteps(FULL)
  assert.equal(steps[0].gain, undefined)
})
