import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const frontendRoot = process.cwd()

function read(path: string) {
  return readFileSync(join(frontendRoot, path), "utf8")
}

/**
 * Funnel lock, measured 2026-07-27: 300 users reached a score, 300 got one,
 * and only 48 ever saved a job. The onboarding reveal listed the top 3 matches
 * as text with no affordance — peak intent had nowhere to land.
 *
 * The invariant: the reveal must let a user act on a job without leaving it.
 */

const MATCHES = "components/onboarding/result-matches.tsx"
const RESULT = "components/onboarding/full-result.tsx"

test("the reveal renders matches a user can act on, not inert rows", () => {
  const full = read(RESULT)

  assert.match(full, /<ResultMatches/)
  // The old inert markup: a bare score span and nothing to press.
  assert.equal(full.includes("Your top matches"), false)
})

test("save writes through the canonical save-job endpoint", () => {
  const matches = read(MATCHES)

  // POST /jobs/save/{id} upserts job_applications(status='saved') — the exact
  // row the funnel measurement counts. A different write would not move it.
  assert.match(matches, /jobsApi\s*\n?\s*\.saveJob\(token, job\.job_id\)/)
  assert.match(matches, /invalidateJobData\(queryClient\)/)
})

test("a failed save reverts instead of leaving a false receipt", () => {
  const matches = read(MATCHES)

  assert.match(matches, /\.catch\(/)
  assert.match(matches, /reverted\.delete\(job\.job_id\)/)
  assert.match(matches, /Couldn&apos;t save/)
})

test("match fit and verdict come from the canonical helpers", () => {
  const matches = read(MATCHES)

  // Re-deriving "how good is this" per surface is how vocabularies fork.
  assert.match(matches, /from "@\/lib\/jobs\/match-verdict"/)
  assert.match(matches, /matchFitScore\(job\)/)
  assert.match(matches, /verdictLabel\(job\.verdict\)/)
  assert.equal(matches.includes("overall_score"), false)
})

test("why-it-matched shows the user's own skills only", () => {
  const matches = read(MATCHES)

  assert.match(matches, /job\.matched_skills \?\? \[\]/)
  // Rendered only when real — no empty shell, no invented reason.
  assert.match(matches, /why\.length > 0 &&/)
})

test("an empty match stack says so instead of pointing at an empty feed", () => {
  const matches = read(MATCHES)
  const full = read(RESULT)

  assert.equal(matches.includes("ready in the market"), false)
  assert.equal(full.includes("ready in the market"), false)
  assert.match(matches, /No live openings match this target yet/)
  // Still polls while the server reports it is genuinely computing.
  assert.match(full, /data\.match_health === "computing"/)
})

test("the page ends on the next step, not the same menu twice", () => {
  const full = read(RESULT)

  assert.match(full, /savedCount > 0 \?/)
  assert.match(full, /Tailor your CV for it/)
  // The tailor target is the shared "your best match", so onboarding and every
  // other surface point at the same job.
  assert.match(full, /pickBestMatch\(/)
})
