import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("onboarding exposes only Experience, Target, and Result stages", () => {
  const progress = read("components/onboarding/onboarding-progress.tsx")
  assert.match(progress, /\["Experience", "Target", "Result"\]/)
  assert.doesNotMatch(progress, /Companies|Lens|Ninja/)
})

test("description result remains an explicitly incomplete preview", () => {
  const preview = read("components/onboarding/profile-preview.tsx")
  assert.match(preview, /Profile Preview/)
  assert.match(preview, /Early estimate/)
  assert.match(preview, /Incomplete until Myro reads a full CV/)
  assert.doesNotMatch(preview, /Your Myro Score|Download/)
})

test("baseline generator fixes the five-question expectation", () => {
  const generator = read("components/onboarding/baseline-generator.tsx")
  assert.match(generator, /5 questions · about 2 minutes/)
  assert.match(generator, /Question \{step\} of 5/)
  assert.match(generator, /Review your starter CV/)
  assert.match(generator, /Approve baseline/)
})

test("full result leads with proof and keeps correction available", () => {
  const result = read("components/onboarding/full-result.tsx")
  assert.match(result, /What Myro understood/)
  assert.match(result, /Your Myro Score/)
  assert.match(result, /SkillCorrectionSheet/)
  assert.doesNotMatch(result, /Download/)
})

test("accepted upload and target are persisted before result navigation", () => {
  const page = read("app/onboarding/page.tsx")
  assert.match(page, /onboarding\.saveExperience/)
  assert.match(page, /onboarding\.saveTarget/)
  assert.match(page, /router\.push\("\/onboarding\/result"\)/)
  assert.match(page, /pollCVUploadStatus/)
  assert.match(page, /state\.isFetchedAfterMount/)
})

test("progressive personalization derives the post-score three-move triad", () => {
  // The old /home three-action checklist retired with the dashboard
  // (Collections cutover 2026-07-07). Its successor is the #146 triad —
  // one skill · one job · one CV move — derived from the user's own score
  // and consumed by the /market Command Rail.
  const triad = read("lib/onboarding/next-best-steps.ts")
  assert.match(triad, /kind: "skill"/)
  assert.match(triad, /kind: "job"/)
  assert.match(triad, /kind: "cv"/)
  const rail = read("components/mission-control/mission-hero-rail.tsx")
  assert.match(rail, /deriveNextBestSteps/)
})
