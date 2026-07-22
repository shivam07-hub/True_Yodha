import test from "node:test"
import assert from "node:assert/strict"

import { buildSkillRoom } from "../lib/skill-room"
import type { ScoreResponse, UserSkillItem, UserSkillsByDomain } from "../lib/api"

function skill(over: Partial<UserSkillItem> = {}): UserSkillItem {
  return {
    key: "quantum_computing",
    display_name: "Quantum Computing",
    level: 2,
    proficiency_title: "Practitioner",
    evidence_text: "Built a QAOA prototype for portfolio optimisation",
    forge_sessions_count: 1,
    forged_level_up_available: false,
    ...over,
  }
}

const score: ScoreResponse = {
  total_score: 30,
  domain_scores: { "Science and Research": 20 },
  gap_skills: [
    { skill: "Quantum Computing", current_level: 2, target_level: 3, gap_score: 8, job_count_30d: 14, why_it_matters: "Named in senior research roles.", score_delta: 3, domain: "Science and Research" },
  ],
  skills_assessed: 1,
  computed_at: "2026-07-22T00:00:00Z",
  band: "senior",
}

function payload(over: Partial<UserSkillItem> = {}): UserSkillsByDomain {
  return {
    by_domain: { "Science and Research": [skill(over)] },
    by_cluster: { "Quantum & Emerging Compute": [skill(over), skill({ key: "qiskit", display_name: "Qiskit" })] },
  }
}

test("the room resolves domain, taxonomy cluster and bracket size for a skill", () => {
  const room = buildSkillRoom(score, payload(), "quantum_computing")
  assert.ok(room)
  assert.equal(room.domain, "Science and Research")
  assert.equal(room.cluster, "Quantum & Emerging Compute")
  assert.equal(room.clusterSize, 2)
  assert.equal(room.skill.proficiency_title, "Practitioner")
})

test("the verbatim CV line is carried through as the evidence for the level", () => {
  const room = buildSkillRoom(score, payload(), "quantum_computing")
  assert.equal(room?.evidence, "Built a QAOA prototype for portfolio optimisation")
})

test("an unproven skill reports null evidence rather than a placeholder", () => {
  const room = buildSkillRoom(score, payload({ evidence_text: null }), "quantum_computing")
  assert.equal(room?.evidence, null)
})

test("whitespace-only evidence counts as no evidence", () => {
  const room = buildSkillRoom(score, payload({ evidence_text: "   " }), "quantum_computing")
  assert.equal(room?.evidence, null)
})

test("the gap row matches on display name as well as key, carrying live demand and honest lift", () => {
  const room = buildSkillRoom(score, payload(), "quantum_computing")
  assert.equal(room?.gap?.job_count_30d, 14)
  assert.equal(room?.gap?.score_delta, 3)
})

test("a skill with no gap row reports null — the market block must stay absent, not zeroed", () => {
  const room = buildSkillRoom({ ...score, gap_skills: [] }, payload(), "quantum_computing")
  assert.equal(room?.gap, null)
})

test("an unknown or missing skill key yields no room", () => {
  assert.equal(buildSkillRoom(score, payload(), "not_a_skill"), null)
  assert.equal(buildSkillRoom(score, payload(), null), null)
})

test("a skill present only in the cluster payload still opens", () => {
  const room = buildSkillRoom(score, { by_domain: {}, by_cluster: payload().by_cluster }, "quantum_computing")
  assert.ok(room)
  assert.equal(room.domain, null)
  assert.equal(room.cluster, "Quantum & Emerging Compute")
})

test("distance to the next bracket comes from the real forge thresholds", () => {
  const room = buildSkillRoom(score, payload({ level: 1, forge_sessions_count: 1 }), "quantum_computing")
  assert.equal(room?.atMax, false)
  assert.ok((room?.sessionsToNext ?? 0) > 0)
})

test("a maxed skill is flagged so the room hides the level ladder", () => {
  const room = buildSkillRoom(score, payload({ level: 4 }), "quantum_computing")
  assert.equal(room?.atMax, true)
})
