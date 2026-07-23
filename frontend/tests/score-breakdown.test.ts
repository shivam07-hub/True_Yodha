import test from "node:test"
import assert from "node:assert/strict"

import { buildScoreBreakdown } from "../lib/score-breakdown"
import { ALL_SCORE_DOMAINS } from "../lib/domain-labels"
import type { GapSkill } from "../lib/api"

// Real Tax-L1 domain names — the actual `domain_scores` vocabulary
// (skill.l1_domain server-side). The old fixtures used fictional short codes
// (SD/DE/AML/CLD — from the dead DOMAIN_LABELS map) that never occur in real
// data, which is exactly how the emptyDomains bug shipped invisibly: the tests
// exercised the same wrong universe the code did. Use real names here so a
// regression back to the fake universe fails a test, not just a screenshot.

function gap(over: Partial<GapSkill>): GapSkill {
  return {
    skill: "Python",
    current_level: 1,
    target_level: 3,
    gap_score: 0.5,
    job_count_30d: 10,
    why_it_matters: "",
    ...over,
  }
}

const TOTAL_DOMAINS = ALL_SCORE_DOMAINS.length

test("evidenced domains render strongest-first; the rest are uncounted against the REAL domain universe", () => {
  const b = buildScoreBreakdown(46, { Business: 22.4, "Science and Research": 71.6 }, [])
  assert.deepEqual(b.domains.map((d) => d.code), ["Science and Research", "Business"]) // 72 before 22
  assert.deepEqual(b.domains.map((d) => d.score), [72, 22]) // rounded
  assert.equal(b.evidencedCount, 2)
  assert.equal(b.emptyCount, TOTAL_DOMAINS - 2)
  assert.equal(b.emptyDomains.length, TOTAL_DOMAINS - 2)
  assert.ok(!b.emptyDomains.some((e) => e.code === "Business" || e.code === "Science and Research"))
})

test("the uncounted tier is the real 31-domain catalogue, never the dead DOMAIN_LABELS code set", () => {
  const b = buildScoreBreakdown(46, { Business: 50 }, [])
  // Regression guard for the exact shipped bug: a phantom code like "SD" must
  // never appear, and every real domain not evidenced must be present.
  assert.ok(!b.emptyDomains.some((e) => e.code === "SD" || e.code === "DE" || e.code === "AML"))
  assert.ok(b.emptyDomains.some((e) => e.code === "Engineering"))
  assert.ok(b.emptyDomains.some((e) => e.code === "Finance"))
  assert.equal(b.emptyDomains.length, TOTAL_DOMAINS - 1)
})

test("bands: >=60 strong, 40-59 building, <40 weak", () => {
  const b = buildScoreBreakdown(50, { "Information Technology": 80, Business: 50, Finance: 12 }, [])
  const byCode = Object.fromEntries(b.domains.map((d) => [d.code, d.band]))
  assert.equal(byCode["Information Technology"], "strong")
  assert.equal(byCode.Business, "building")
  assert.equal(byCode.Finance, "weak")
})

test("each domain's lever is its highest real what-if gain, deep-linked by skill", () => {
  const b = buildScoreBreakdown(40, { "Information Technology": 30 }, [
    gap({ skill: "Django", domain: "Information Technology", score_delta: 2.6 }),
    gap({ skill: "FastAPI", domain: "Information Technology", score_delta: 5.1 }),
    gap({ skill: "AWS", domain: "Engineering", score_delta: 9 }), // other domain — ignored
  ])
  assert.deepEqual(b.domains[0].lever, { skill: "FastAPI", gain: 5 })
})

test("a sub-1-point gain is never shown as a lever (no-fab)", () => {
  const b = buildScoreBreakdown(40, { "Information Technology": 30 }, [
    gap({ skill: "Django", domain: "Information Technology", score_delta: 0.4 }),
  ])
  assert.equal(b.domains[0].lever, null)
})

test("missing domain/score_delta (pre-recompute) → no lever, no crash", () => {
  const b = buildScoreBreakdown(40, { "Information Technology": 30 }, [gap({ skill: "Django" })])
  assert.equal(b.domains[0].lever, null)
})

test("no evidenced domains → empty model the view can skip", () => {
  const b = buildScoreBreakdown(0, {}, [])
  assert.equal(b.domains.length, 0)
})

test("domain names pass through domainLabel() unchanged — the code IS the label for real data", () => {
  const b = buildScoreBreakdown(50, { "Media and Communications": 60 }, [])
  assert.equal(b.domains[0].label, "Media and Communications")
})
