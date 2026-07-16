import test from "node:test"
import assert from "node:assert/strict"

import {
  KEYWORD_WEIGHT,
  SEMANTIC_WEIGHT,
  coveragePct,
  keywordLayerSpan,
  matchScore,
} from "../components/cv/builder/match-score"

// ── The one-number contract (Shivam lock, 2026-07-16) ───────────────────────
// Semantic requirement coverage leads (70%), keyword landing assists (30%),
// content quality subtracts. High job fit → high CV score, structurally.

test("weights sum to a whole score", () => {
  assert.equal(SEMANTIC_WEIGHT + KEYWORD_WEIGHT, 1)
})

test("coveragePct: covered full, partial half, missing none", () => {
  assert.equal(coveragePct({ covered: 10, weak: 0, gap: 0 }), 100)
  assert.equal(coveragePct({ covered: 0, weak: 10, gap: 0 }), 50)
  assert.equal(coveragePct({ covered: 0, weak: 0, gap: 10 }), 0)
  assert.equal(coveragePct({ covered: 9, weak: 1, gap: 4 }), (9.5 / 14) * 100)
})

test("coveragePct: null when nothing to score against", () => {
  assert.equal(coveragePct(null), null)
  assert.equal(coveragePct(undefined), null)
  assert.equal(coveragePct({ covered: 0, weak: 0, gap: 0 }), null)
})

test("a well-covered job scores high even with zero verbatim keyword hits", () => {
  // The header bug: brain said "Worth it · 84", keyword-only Ready said 0.
  // 12/14 requirements covered, no taxonomy key verbatim on the CV:
  const score = matchScore({ covered: 12, weak: 0, gap: 2 }, 0, 0)
  assert.equal(score, 60) // 0.7 × 85.7 — semantic floor holds the score up
})

test("keywords assist but never control", () => {
  const counts = { covered: 7, weak: 2, gap: 5 } // 57.1% semantic
  const noKw = matchScore(counts, 0, 0)
  const allKw = matchScore(counts, 100, 0)
  assert.equal(allKw - noKw, 30) // the keyword layer moves at most 30 points
})

test("content-quality penalty subtracts from the blended score", () => {
  const counts = { covered: 10, weak: 0, gap: 0 }
  assert.equal(matchScore(counts, 100, 0), 100)
  assert.equal(matchScore(counts, 100, 12), 88)
})

test("keyword-only fallback when coverage has not landed", () => {
  assert.equal(matchScore(null, 62, 0), 62)
  assert.equal(matchScore(null, 62, 10), 52)
})

test("score clamps to 0..100", () => {
  assert.equal(matchScore(null, 5, 40), 0)
  assert.equal(matchScore({ covered: 10, weak: 0, gap: 0 }, 100, -5), 100)
})

test("fix +N math reads the layer span the score actually uses", () => {
  assert.equal(keywordLayerSpan(true), 30)
  assert.equal(keywordLayerSpan(false), 100)
})
