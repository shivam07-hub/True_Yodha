import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const frontendRoot = process.cwd()
const read = (path: string) => readFileSync(join(frontendRoot, path), "utf8")

test("the first shortlist is a single-selection decision surface", () => {
  const matches = read("components/onboarding/result-matches.tsx")

  assert.match(matches, /role="radiogroup"/)
  assert.match(matches, /type="radio"/)
  assert.match(matches, /onSelect\(job\.job_id\)/)
  assert.doesNotMatch(matches, /saveJob|Tailor CV|See every match/)
})

test("the final step persists one role before offering tailoring", () => {
  const result = read("components/onboarding/full-result.tsx")
  const success = read("components/onboarding/first-role-success.tsx")

  assert.match(result, /onboarding\.commitFirstRole/)
  assert.match(result, /Save \$\{selectedJob\.title\} at \$\{selectedJob\.company/)
  assert.match(result, /receipt\.tailor_href/)
  assert.match(success, /Tailor my CV for this role/)
  assert.match(success, /tailorHref/)
  assert.doesNotMatch(result, /savedCount|pickBestMatch|See all matches/)
})

test("failed persistence keeps the selection and shows an adjacent retry", () => {
  const result = read("components/onboarding/full-result.tsx")

  assert.match(result, /setError\(/)
  assert.match(result, /role="alert"/)
  assert.doesNotMatch(result, /setSelectedJobId\(null\)/)
})

test("match fit and reasons remain grounded in canonical match data", () => {
  const matches = read("components/onboarding/result-matches.tsx")

  assert.match(matches, /matchFitScore\(job\)/)
  assert.match(matches, /verdictLabel\(job\.verdict\)/)
  assert.match(matches, /job\.matched_skills \?\? \[\]/)
})

test("an empty shortlist has exactly one recovery action", () => {
  const result = read("components/onboarding/full-result.tsx")

  assert.match(result, /No live roles match this direction yet/)
  assert.match(result, /Adjust my direction/)
  assert.match(result, /onAdjust\(\)/)
  assert.doesNotMatch(result, /ready in the market/)
})

test("the shortlist cache is target-scoped and fetch failures stop loading", () => {
  const result = read("components/onboarding/full-result.tsx")

  assert.match(result, /result\.target_context_hash/)
  assert.match(result, /query\.state\.status === "error"/)
  assert.match(result, /Couldn&apos;t load your live roles/)
  assert.match(result, /Try loading roles again/)
})
