import assert from "node:assert/strict"
import test from "node:test"
import {
  buildSkillEvidenceIndex,
  nextSkillLevel,
  skillDemandTotal,
  skillReadiness,
} from "../lib/skill-intelligence"
import type { UserSkillsByDomain } from "../lib/api"

test("skill readiness buckets map CV levels to user-facing states", () => {
  assert.equal(skillReadiness(0), "Gap")
  assert.equal(skillReadiness(1), "Gap")
  assert.equal(skillReadiness(2), "Building")
  assert.equal(skillReadiness(3), "Building")
  assert.equal(skillReadiness(4), "Strong")
})

test("next skill level is clamped to the L1-L5 ladder", () => {
  assert.equal(nextSkillLevel(0), 1)
  assert.equal(nextSkillLevel(2), 3)
  assert.equal(nextSkillLevel(5), 5)
})

test("skill demand totals ignore still-loading company rows", () => {
  const rows = {
    Accenture: { "Data Analysis": 96 },
    "Tata Steel": null,
    Airbnb: { "Data Analysis": 8 },
  }
  assert.equal(skillDemandTotal(rows, "Data Analysis"), 104)
})

test("CV evidence is indexed by lower-case display name", () => {
  const skills: UserSkillsByDomain = {
    by_cluster: {},
    by_domain: {
      data: [{
        key: "data-analysis",
        display_name: "Data Analysis",
        level: 2,
        proficiency_title: "Builder",
        description: null,
        evidence_text: "Sales dashboard",
        forge_sessions_count: 0,
        forged_level_up_available: false,
      }],
    },
  }
  assert.equal(buildSkillEvidenceIndex(skills)["data analysis"]?.evidence_text, "Sales dashboard")
})
