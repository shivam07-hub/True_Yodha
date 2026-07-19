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
