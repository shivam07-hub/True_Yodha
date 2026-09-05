import test from "node:test"
import assert from "node:assert/strict"

import { formatDays, formatRate, rateBand } from "../lib/ghost-index/rate"

test("a rate never rounds into a boundary it did not reach", () => {
  // CRISIL: 515 of 517. Math.round prints "100%" beside that same row's
  // "2 ads pulled" — a contradiction next to a named company.
  assert.equal(formatRate(515 / 517), "99%")
  // DBS: 1 of 139. Rounds to 0.7%, but the ad IS still up on one listing.
  assert.equal(formatRate(1 / 139), "1%")
})

test("100% and 0% mean exactly that", () => {
  assert.equal(formatRate(1), "100%")
  assert.equal(formatRate(0), "0%")
})

test("a withheld rate is a null cell, never a zero", () => {
  // Below the minimum cell the API sends null. Printing 0% there would claim
  // the employer pulls every ad, which is the opposite of "we cannot say".
  assert.equal(formatRate(null), "—")
  assert.equal(rateBand(null), "none")
})

test("the severity band splits at the published thresholds", () => {
  assert.equal(rateBand(0.76), "high")
  assert.equal(rateBand(0.5), "high")
  assert.equal(rateBand(0.34), "mid")
  assert.equal(rateBand(0.2), "mid")
  assert.equal(rateBand(0.05), "low")
  assert.equal(rateBand(0), "low")
})

test("day counts carry their unit and withhold cleanly", () => {
  assert.equal(formatDays(4.7), "4.7d")
  assert.equal(formatDays(0), "0d")
  assert.equal(formatDays(null), "—")
})
