import test from "node:test"
import assert from "node:assert/strict"

import { computeStreakFromDates } from "../lib/forge-helpers"

function isoDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

test("counts consecutive days ending today", () => {
  assert.equal(computeStreakFromDates([isoDaysAgo(0), isoDaysAgo(1), isoDaysAgo(2)]), 3)
})

test("breaks the streak on a missing day", () => {
  assert.equal(computeStreakFromDates([isoDaysAgo(0), isoDaysAgo(2), isoDaysAgo(3)]), 1)
})

test("zero when there is no activity today", () => {
  assert.equal(computeStreakFromDates([isoDaysAgo(1), isoDaysAgo(2)]), 0)
})

test("dedupes multiple sessions on the same day", () => {
  assert.equal(computeStreakFromDates([isoDaysAgo(0), isoDaysAgo(0), isoDaysAgo(1)]), 2)
})

test("empty input yields zero", () => {
  assert.equal(computeStreakFromDates([]), 0)
})
