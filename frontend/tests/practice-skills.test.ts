import test from "node:test"
import assert from "node:assert/strict"

import { buildPracticeSkills } from "../lib/practice-skills"
import type {
  SkillGapResponse,
  UserSkillDemandResponse,
  UserSkillItem,
  UserSkillsByDomain,
} from "../lib/api"

function skill(partial: Partial<UserSkillItem> & { key: string; display_name: string; level: number }): UserSkillItem {
  return {
    proficiency_title: "Scout",
    evidence_text: null,
    forge_sessions_count: 0,
    forged_level_up_available: false,
    ...partial,
  }
}

function userSkills(items: UserSkillItem[]): UserSkillsByDomain {
  return { by_domain: { Operations: items }, by_cluster: {} }
}

function gapResponse(company: string, skills: SkillGapResponse["skills"]): SkillGapResponse {
  return { job_id: company, job_title: "Role", company, skills, gap_pct: 0, total_required: skills.length, missing_count: 0 }
}

test("owned skills surface from mySkills even without an upgrade flag", () => {
  const result = buildPracticeSkills(userSkills([skill({ key: "a", display_name: "Data Analysis", level: 2 })]), [], undefined)
  assert.equal(result.owned.length, 1)
  assert.equal(result.owned[0]?.item.display_name, "Data Analysis")
  assert.equal(result.gaps.length, 0)
})

test("a skill that is both on CV and a job gap appears once, as owned + enriched", () => {
  const result = buildPracticeSkills(
    userSkills([skill({ key: "a", display_name: "Stakeholder Management", level: 1 })]),
    [gapResponse("Sanofi", [{ skill: "Stakeholder Management", is_primary: true, user_level: 1, required_level: 3, missing: false }])],
    undefined,
  )
  assert.equal(result.owned.length, 1)
  assert.equal(result.gaps.length, 0, "must not duplicate into the gap group")
  assert.equal(result.owned[0]?.targetLevel, 3, "job target level enriches the owned row")
  assert.equal(result.owned[0]?.jobCount, 1)
  assert.ok(result.owned[0]?.sources.includes("Job gap · Sanofi"))
})

test("a demanded skill NOT on the CV becomes a standalone gap row", () => {
  const result = buildPracticeSkills(
    userSkills([skill({ key: "a", display_name: "Data Analysis", level: 2 })]),
    [gapResponse("Autodesk", [{ skill: "Kubernetes", is_primary: false, user_level: 0, required_level: 2, missing: true }])],
    undefined,
  )
  assert.equal(result.gaps.length, 1)
  assert.equal(result.gaps[0]?.skill_name, "Kubernetes")
  assert.equal(result.gaps[0]?.levelTo, 2)
  assert.equal(result.gaps[0]?.company, "Autodesk")
})

test("skill demand enriches owned by taxonomy key", () => {
  const demand: UserSkillDemandResponse = {
    total: 1,
    skills: [{ skill: "a", display_name: "Data Analysis", current_level: 2, proficiency_title: "Trailblazer", target_level: 4, needs_upgrade: true, job_count_30d: 12, weighted_demand: 88 }],
  }
  const result = buildPracticeSkills(userSkills([skill({ key: "a", display_name: "Data Analysis", level: 2 })]), [], demand)
  assert.equal(result.owned.length, 1)
  assert.equal(result.owned[0]?.targetLevel, 4)
  assert.equal(result.owned[0]?.demand, 88)
  assert.equal(result.owned[0]?.jobCount, 12)
})

test("empty inputs yield empty groups (no crash)", () => {
  const result = buildPracticeSkills(undefined, [], undefined)
  assert.deepEqual(result, { owned: [], gaps: [] })
})
