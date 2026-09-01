import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { sortAnchorCards, type SkillPathCard } from "../lib/career-skill-path"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8")

function card(taxonomy_key: string, state: SkillPathCard["state"]): SkillPathCard {
  return {
    skill_id: null,
    taxonomy_key,
    display_name: taxonomy_key,
    state,
    current_level: null,
    required_level: null,
    evidence_pointer: null,
    demand: null,
    ladder_complete: false,
    certificate_status: "none",
    verification_id: null,
    next_practice_level: null,
    request_status: "none",
  }
}

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

test("anchor cards put not-evidenced gaps first", () => {
  const ordered = sortAnchorCards([
    card("Sales", "on_cv"),
    card("Cold Calling", "not_evidenced"),
    card("Cross-Selling", "practised"),
    card("Channel Sales", "not_evidenced"),
  ])
  assert.deepEqual(ordered.map((item) => item.taxonomy_key), [
    "Cold Calling",
    "Channel Sales",
    "Sales",
    "Cross-Selling",
  ])
})
