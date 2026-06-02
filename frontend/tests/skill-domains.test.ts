import { test } from "node:test"
import assert from "node:assert/strict"
import {
  buildDomainEntries,
  domainAvg,
  domainStatus,
  skillIntelStats,
} from "../lib/skill-domains"
import type { UserSkillsByDomain } from "../lib/api"

const skill = (over: Partial<{ level: number; evidence_text: string | null }> = {}) => ({
  key: Math.random().toString(36).slice(2),
  display_name: "x",
  level: over.level ?? 0,
  proficiency_title: "",
  evidence_text: over.evidence_text ?? null,
  forge_sessions_count: 0,
  forged_level_up_available: false,
  correction_count: 0,
})

test("domainAvg = mean level × 20, rounded; empty = 0", () => {
  assert.equal(domainAvg([]), 0)
  assert.equal(domainAvg([{ level: 5 }]), 100)
  assert.equal(domainAvg([{ level: 1 }, { level: 2 }]), 30) // 1.5 × 20
})

test("domainStatus thresholds: <40 at-risk, <70 building, else strong", () => {
  assert.equal(domainStatus(0), "at-risk")
  assert.equal(domainStatus(39), "at-risk")
  assert.equal(domainStatus(40), "building")
  assert.equal(domainStatus(69), "building")
  assert.equal(domainStatus(70), "strong")
})

test("buildDomainEntries + skillIntelStats roll up correctly", () => {
  const skills: UserSkillsByDomain = {
    by_domain: {
      A: [skill({ level: 1 }), skill({ level: 1, evidence_text: "proof" })], // avg 20 → at-risk
      B: [skill({ level: 4, evidence_text: "p" })], // avg 80 → strong
    },
    by_cluster: {},
  }
  const entries = buildDomainEntries(skills)
  assert.equal(entries.length, 2)

  const stats = skillIntelStats(skills, entries)
  assert.equal(stats.domainCount, 2)
  assert.equal(stats.totalSkills, 3)
  assert.equal(stats.needProofCount, 1) // one skill has no evidence_text
  assert.equal(stats.weakDomainCount, 1) // domain A avg 20 < 40
})
