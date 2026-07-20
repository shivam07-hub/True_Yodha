import { test } from "node:test"
import assert from "node:assert/strict"
import { sessionsToNextLevel, MAX_LEVEL } from "../lib/level-thresholds"

// LEVEL_THRESHOLDS = {0:1, 1:3, 2:9, 3:27}; cumulative to L2 = 1+3 = 4.

test("fresh skill with no forge sessions → full next-level threshold", () => {
  assert.equal(sessionsToNextLevel(0, 0), 1) // L0→L1 = 1
  assert.equal(sessionsToNextLevel(1, 0), 3) // sits at L1, forged 0 → 3 to L2
})

test("forge progress within the current level reduces the count", () => {
  // At L2 (needs 9 to L3). cumulative-to-L2 = 4. forged 6 total → 2 into L2 → 7 left.
  assert.equal(sessionsToNextLevel(2, 6), 7)
})

test("CV-inferred level with fewer forge sessions than its cumulative → full threshold, never negative", () => {
  // Level 2 by CV but only 1 forge session (below cumulative 4): into clamps to 0.
  assert.equal(sessionsToNextLevel(2, 1), 9)
  assert.equal(sessionsToNextLevel(3, 0), 27)
})

test("at or beyond max level → 0", () => {
  assert.equal(sessionsToNextLevel(MAX_LEVEL, 100), 0)
  assert.equal(sessionsToNextLevel(4, 0), 0)
})

test("never returns a negative", () => {
  assert.equal(sessionsToNextLevel(1, 999), 0)
})
