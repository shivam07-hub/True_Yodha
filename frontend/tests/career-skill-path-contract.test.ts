import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8")

test("practice no longer rebuilds demand from job gaps", () => {
  const practice = read("app/(authed)/practice/page.tsx")
  assert.doesNotMatch(practice, /buildPracticeSkills/)
  assert.doesNotMatch(practice, /jobs\.matches/)
  assert.match(practice, /SkillPathMaps/)
  assert.match(practice, /RequiresCareerTarget/)
})

test("upskilling view does not overlay frontend demand", () => {
  const view = read("components/skills/upskilling/upskilling-view.tsx")
  assert.doesNotMatch(view, /function mergeSkills/)
  assert.doesNotMatch(view, /practiceSkills/)
  assert.doesNotMatch(view, /wanted by/)
})

test("retired practice-skills demand overlay is gone", () => {
  let missing = false
  try {
    read("lib/practice-skills.ts")
  } catch {
    missing = true
  }
  assert.equal(missing, true)
})

test("climb list does not render required-by demand prose", () => {
  const row = read("components/skills/upskilling/climb-row.tsx")
  assert.doesNotMatch(row, /wanted by/)
  assert.doesNotMatch(row, /required by/)
})

test("personal job-count demand heuristic is gone; corpus taxonomy helper remains", () => {
  const demand = read("lib/demand-band.ts")
  assert.doesNotMatch(demand, /export function bandFromJobCount/)
  assert.match(demand, /export function bandFromCorpusJobCount/)
})
