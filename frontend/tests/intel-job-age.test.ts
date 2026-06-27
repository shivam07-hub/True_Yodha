import test from "node:test"
import assert from "node:assert/strict"

import { fmtAgeMin } from "../components/public/intel/intel-data"

test("intel job age hides zero-minute freshness instead of claiming 0m ago", () => {
  assert.equal(fmtAgeMin(0), null)
})

test("intel job age hides unknown freshness", () => {
  assert.equal(fmtAgeMin(null), null)
  assert.equal(fmtAgeMin(undefined), null)
})

test("intel job age still formats real positive ages", () => {
  assert.equal(fmtAgeMin(12), "12m ago")
  assert.equal(fmtAgeMin(180), "3h ago")
  assert.equal(fmtAgeMin(60 * 24 * 3), "3d ago")
})
