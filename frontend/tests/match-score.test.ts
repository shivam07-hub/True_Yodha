import test from "node:test"
import assert from "node:assert/strict"

import {
  coveragePct,
  matchScore,
} from "../components/cv/builder/match-score"

// ── The one-number contract (coverage-only, 2026-07-18) ─────────────────────
// The JD's real requirements (jd_coverage), classified against the user's
// stories + CV lines, ARE the Match score; content quality subtracts. No
// taxonomy keyword layer — a covered CV scores high, an uncovered one low,
// never a fake 0 from a keyword that never appears verbatim.

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

test("coverage IS the score — the readiness fallback is ignored once it lands", () => {
  // The header bug: brain said "Worth it · 84", taxonomy keyword-only Ready
  // said 0. Now 12/14 requirements covered scores high regardless of readiness.
  assert.equal(matchScore({ covered: 12, weak: 0, gap: 2 }, 0, 0), 86) // 12/14
  assert.equal(matchScore({ covered: 12, weak: 0, gap: 2 }, 100, 0), 86) // fallback ignored
})

test("a well-covered CV can reach a high Match honestly", () => {
  assert.equal(matchScore({ covered: 13, weak: 0, gap: 0 }, 0, 0), 100)
})

test("a genuinely uncovered CV scores low, not a fake 0-vs-100 mismatch", () => {
  assert.equal(matchScore({ covered: 0, weak: 0, gap: 13 }, 0, 0), 0)
})

test("content-quality penalty subtracts from the coverage score", () => {
  const counts = { covered: 10, weak: 0, gap: 0 }
  assert.equal(matchScore(counts, 100, 0), 100)
  assert.equal(matchScore(counts, 100, 12), 88)
})

test("readiness fallback only when coverage has not landed", () => {
  assert.equal(matchScore(null, 62, 0), 62)
  assert.equal(matchScore(null, 62, 10), 52)
})

test("score clamps to 0..100", () => {
  assert.equal(matchScore(null, 5, 40), 0)
  assert.equal(matchScore({ covered: 10, weak: 0, gap: 0 }, 100, -5), 100)
})
