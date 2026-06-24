import test from "node:test"
import assert from "node:assert/strict"

import { buildScoreBreakdown } from "../lib/score-breakdown"
import { DOMAIN_LABELS } from "../lib/domain-labels"
import type { GapSkill } from "../lib/api"

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

const TOTAL_DOMAINS = Object.keys(DOMAIN_LABELS).length

test("evidenced domains render strongest-first; the rest are uncounted", () => {
  const b = buildScoreBreakdown(46, { SD: 22.4, DE: 71.6 }, [])
  assert.deepEqual(b.domains.map((d) => d.code), ["DE", "SD"]) // 72 before 22
  assert.deepEqual(b.domains.map((d) => d.score), [72, 22]) // rounded
  assert.equal(b.evidencedCount, 2)
  assert.equal(b.emptyCount, TOTAL_DOMAINS - 2)
  assert.equal(b.emptyDomains.length, TOTAL_DOMAINS - 2)
  assert.ok(!b.emptyDomains.some((e) => e.code === "SD" || e.code === "DE"))
})

test("bands: >=60 strong, 40-59 building, <40 weak", () => {
  const b = buildScoreBreakdown(50, { SD: 80, DE: 50, AML: 12 }, [])
  const byCode = Object.fromEntries(b.domains.map((d) => [d.code, d.band]))
  assert.equal(byCode.SD, "strong")
  assert.equal(byCode.DE, "building")
  assert.equal(byCode.AML, "weak")
})

test("each domain's lever is its highest real what-if gain, deep-linked by skill", () => {
  const b = buildScoreBreakdown(40, { SD: 30 }, [
    gap({ skill: "Django", domain: "SD", score_delta: 2.6 }),
    gap({ skill: "FastAPI", domain: "SD", score_delta: 5.1 }),
    gap({ skill: "AWS", domain: "CLD", score_delta: 9 }), // other domain — ignored for SD
  ])
  assert.deepEqual(b.domains[0].lever, { skill: "FastAPI", gain: 5 })
})

test("a sub-1-point gain is never shown as a lever (no-fab)", () => {
  const b = buildScoreBreakdown(40, { SD: 30 }, [gap({ skill: "Django", domain: "SD", score_delta: 0.4 })])
  assert.equal(b.domains[0].lever, null)
})

test("missing domain/score_delta (pre-recompute) → no lever, no crash", () => {
  const b = buildScoreBreakdown(40, { SD: 30 }, [gap({ skill: "Django" })])
  assert.equal(b.domains[0].lever, null)
})

test("no evidenced domains → empty model the view can skip", () => {
  const b = buildScoreBreakdown(0, {}, [])
  assert.equal(b.domains.length, 0)
})
