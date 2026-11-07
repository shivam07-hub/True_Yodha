/**
 * #61 S6 — the phone rail shows its step names, and a failed read is not an
 * invitation to upload again.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("the step names stay visible on a phone", () => {
  const rail = read("components/onboarding/journey-progress.tsx")
  assert.match(rail, /Your CV/)
  assert.match(rail, /Your job/)
  assert.doesNotMatch(rail, /hidden[\s\S]{0,80}sm:block/)
  assert.doesNotMatch(rail, /sr-only/)
})

test("a failed onboarding read offers a retry and does not open the upload", () => {
  const page = read("app/onboarding/page.tsx")
  const failed = page.indexOf("state.isError")
  const upload = page.indexOf("<ExperienceStep")
  assert.ok(failed > -1 && upload > failed)
  assert.match(page, /state\.isError\) return/)
  assert.match(page, /Couldn&apos;t load your next step/)
  assert.match(page, /state\.refetch\(\)/)
})
