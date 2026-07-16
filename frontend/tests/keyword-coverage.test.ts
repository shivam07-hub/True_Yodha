import test from "node:test"
import assert from "node:assert/strict"

import {
  evaluateTargets,
  kwMatches,
  targetsFromSkillGap,
} from "../components/cv/builder/keyword-utils"
import type { SkillGapItem } from "../lib/api"

function gapItem(partial: Partial<SkillGapItem>): SkillGapItem {
  return {
    skill: "Python",
    is_primary: true,
    user_level: 0,
    required_level: 4,
    missing: true,
    ...partial,
  }
}

// ── The Ready-vs-Worth-it header bug (2026-07-16) ────────────────────────────
// The server skill-gap already credits skills the user HAS (`missing: false`),
// but the playground re-scored coverage by verbatim substring on the CV text.
// Taxonomy keys ("Time Series Analysis And Forecasting") never appear
// word-for-word in prose → Ready rendered 0/100 beside a "Worth it · 84" chip.

test("server-credited skill stays covered even when its taxonomy key is absent from CV text", () => {
  const targets = targetsFromSkillGap([
    gapItem({ skill: "Time Series Analysis And Forecasting", missing: false, user_level: 4 }),
  ])
  const evaluated = evaluateTargets(targets, "Led demand planning models across three retail chains.")
  assert.equal(evaluated[0].matched, true)
})

test("missing skill gains coverage the moment its keyword lands on visible text", () => {
  const targets = targetsFromSkillGap([gapItem({ skill: "Kubernetes", missing: true })])
  assert.equal(evaluateTargets(targets, "Built CI pipelines.")[0].matched, false)
  assert.equal(evaluateTargets(targets, "Deployed services on Kubernetes.")[0].matched, true)
})

test("missing skill with no text hit stays uncovered", () => {
  const targets = targetsFromSkillGap([gapItem({ skill: "Terraform", missing: true })])
  const evaluated = evaluateTargets(targets, "Automated infra with scripts.")
  assert.equal(evaluated[0].matched, false)
})

test("evaluateTargets preserves weights and never mutates its input", () => {
  const targets = targetsFromSkillGap([
    gapItem({ skill: "SQL", is_primary: true, missing: true }),
    gapItem({ skill: "Excel", is_primary: false, missing: true }),
  ])
  const evaluated = evaluateTargets(targets, "Advanced SQL and Excel modelling.")
  assert.equal(evaluated[0].weight, 3)
  assert.equal(evaluated[1].weight, 2)
  assert.equal(targets[0].matched, false, "input targets must stay untouched")
  assert.equal(evaluated[0].matched, true)
  assert.equal(evaluated[1].matched, true)
})

// ── Word-boundary matching for short keys ────────────────────────────────────
// The old inline check used raw `.includes`, so "R" matched inside "React" and
// "Go" inside "Google" — false credit. kwMatches is the single matcher now.

test("short keywords require word boundaries", () => {
  assert.equal(kwMatches("Built React dashboards", "R"), false)
  assert.equal(kwMatches("Analysis in R and Python", "R"), true)
  assert.equal(kwMatches("Worked at Google", "Go"), false)
  assert.equal(kwMatches("Services written in Go", "Go"), true)
})

test("long keywords match case-insensitively as substrings", () => {
  assert.equal(kwMatches("deep experience with kubernetes clusters", "Kubernetes"), true)
})
