import test from "node:test"
import assert from "node:assert/strict"

import { aspirationCount } from "../lib/market/aspiration-count"

test("an unread window does not call itself a finished judgment", () => {
  const line = aspirationCount(0, 1000, 0)
  assert.equal(line, "0 of 1,000 opened")
  assert.doesNotMatch(line ?? "", /worth your time/)
  assert.doesNotMatch(line ?? "", /checked/)
})

test("cleared jobs are named only once the judge has kept one", () => {
  assert.equal(aspirationCount(23, 977, 0), "23 of 1,000 opened")
  assert.equal(aspirationCount(23, 977, 8), "23 of 1,000 opened. 8 worth your time.")
})

test("an empty pool has nothing to count", () => {
  assert.equal(aspirationCount(0, 0, 0), null)
})
