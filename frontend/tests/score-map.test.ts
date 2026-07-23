import test from "node:test"
import assert from "node:assert/strict"

import { buildCvEvidenceHref, buildScoreMap, buildScoreMapHref } from "../lib/score-map"
import type { ScoreResponse, UserSkillsByDomain } from "../lib/api"

const score: ScoreResponse = {
  total_score: 30,
  domain_scores: { Business: 50, Sales: 10 },
  gap_skills: [],
  skills_assessed: 2,
  computed_at: "2026-07-19T00:00:00Z",
  band: "entry",
}

const skills: UserSkillsByDomain = {
  by_domain: {
    Business: [{ key: "strategy", display_name: "Strategy", level: 5, proficiency_title: "Legend", evidence_text: "Built strategy", forge_sessions_count: 0, forged_level_up_available: false }],
    Sales: [{ key: "sales", display_name: "Sales", level: 5, proficiency_title: "Legend", evidence_text: null, forge_sessions_count: 0, forged_level_up_available: false }],
  },
  by_cluster: {},
}

test("the radar axes use canonical score domains, never a second skill-level calculation", () => {
  const model = buildScoreMap(score, skills)

  assert.deepEqual(model.axes.map((axis) => [axis.domain, axis.score, axis.ratio]), [
    ["Business", 50, 0.5],
    ["Sales", 10, 0.1],
  ])
  assert.equal(model.totalScore, 30)
})

test("the map opens the requested domain and ranks its highest verified score lift first", () => {
  const model = buildScoreMap({
    ...score,
    gap_skills: [
      { skill: "Negotiation", current_level: 1, target_level: 2, gap_score: 0.8, job_count_30d: 30, why_it_matters: "", score_delta: 2, domain: "Sales" },
      { skill: "Storytelling", current_level: 1, target_level: 2, gap_score: 0.6, job_count_30d: 18, why_it_matters: "", score_delta: 4, domain: "Sales" },
    ],
  }, skills, "Sales")

  assert.equal(model.selected?.domain, "Sales")
  assert.deepEqual(model.selected?.skills.map((skill) => skill.display_name), ["Sales"])
  assert.equal(model.selected?.evidenceCount, 0)
  assert.deepEqual(model.topMove, { skill: "Storytelling", gain: 4, jobs: 18, domain: "Sales" })
})

test("with no domain requested, the map opens where the biggest verified lift is, not the lowest score", () => {
  const model = buildScoreMap({
    ...score,
    gap_skills: [
      { skill: "Storytelling", current_level: 1, target_level: 2, gap_score: 0.6, job_count_30d: 18, why_it_matters: "", score_delta: 5, domain: "Business" },
    ],
  }, skills)

  // Business (50) outscores Sales (10), so lowest-score would have opened Sales.
  // The biggest lever lives in Business, so that is where the page opens.
  assert.equal(model.selected?.domain, "Business")
  assert.equal(model.topMove?.skill, "Storytelling")
})

test("with no lever reaching +1 pt, the default leads with the strongest domain, never the lowest", () => {
  const model = buildScoreMap({ ...score, gap_skills: [] }, skills)
  assert.equal(model.selected?.domain, "Business")
})

test("a lever in an uncounted domain is ignored — the default only opens a domain that is on the radar", () => {
  const model = buildScoreMap({
    ...score,
    gap_skills: [
      { skill: "Ghost", current_level: 1, target_level: 2, gap_score: 0.9, job_count_30d: 40, why_it_matters: "", score_delta: 9, domain: "Astral Projection" },
    ],
  }, skills)
  assert.equal(model.selected?.domain, "Business")
})

test("requesting a real but unevidenced domain opens its empty state, not the default axis (Q7)", () => {
  const model = buildScoreMap(score, skills, "Engineering")
  assert.equal(model.selected, null)
  assert.equal(model.selectedEmptyDomain, "Engineering")
  assert.equal(model.topMove, null)
})

test("an unevidenced-domain request tolerates case and whitespace, same as an evidenced one", () => {
  const model = buildScoreMap(score, skills, "  engineering ")
  assert.equal(model.selectedEmptyDomain, "Engineering")
})

test("requesting a name that isn't in the real taxonomy at all falls back to the default axis, not an empty state", () => {
  const model = buildScoreMap(score, skills, "Not A Real Domain")
  assert.equal(model.selectedEmptyDomain, null)
  assert.equal(model.selected?.domain, "Business")
})

test("with no domain requested, selectedEmptyDomain stays null — the default is always an evidenced axis", () => {
  const model = buildScoreMap(score, skills)
  assert.equal(model.selectedEmptyDomain, null)
  assert.ok(model.selected)
})

test("score and CV evidence links preserve the selected domain and skill", () => {
  assert.equal(
    buildScoreMapHref({ panel: "why", domain: "Information Technology", skill: "Data Visualization" }),
    "/skills?panel=why&domain=Information+Technology&skill=Data+Visualization",
  )
  assert.equal(
    buildCvEvidenceHref({ domain: "Information Technology", skill: "Data Visualization" }),
    "/cv?edit=1&tab=skills&from=score-map&domain=Information+Technology&skill=Data+Visualization",
  )
})
