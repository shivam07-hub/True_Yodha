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
})

test("progressive personalization uses a durable three-action checklist", () => {
  const checklist = read("components/onboarding/next-steps.tsx")
  assert.match(checklist, /Review one score gap/)
  assert.match(checklist, /Save a relevant job/)
  assert.match(checklist, /Tailor your CV/)
  assert.match(checklist, /onboarding\.dismissChecklist/)
})
