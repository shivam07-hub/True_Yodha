import test from "node:test"
import assert from "node:assert/strict"
import { isCredibleRecommendation } from "../lib/jobs/credible-recommendation"
import type { JobMatch } from "../lib/api"

const base = {
  is_recommended: true,
  overall_score: 3.5,
  recommendation: "Apply",
  seniority_compatibility: "compatible",
  baseline_version_id: 12,
  target_context_hash: "current-context",
} as JobMatch

test("accepts only a fully contextual credible recommendation", () => {
  assert.equal(isCredibleRecommendation(base), true)
})

test("rejects weak, stale, skipped, and seniority-unknown jobs", () => {
  assert.equal(isCredibleRecommendation({ ...base, overall_score: 3.49 }), false)
  assert.equal(isCredibleRecommendation({ ...base, recommendation: "Skip" }), false)
  assert.equal(isCredibleRecommendation({ ...base, seniority_compatibility: null }), false)
  assert.equal(isCredibleRecommendation({ ...base, seniority_compatibility: "incompatible" }), false)
  assert.equal(isCredibleRecommendation({ ...base, target_context_hash: null }), false)
  assert.equal(isCredibleRecommendation({ ...base, is_recommended: false }), false)
})
