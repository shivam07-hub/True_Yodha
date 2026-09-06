import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { employerRecord } from "../lib/jobs/employer-record"
import type { GhostIndexRow } from "../lib/api"

const row = (over: Partial<GhostIndexRow>): GhostIndexRow => ({
  scope_key: "Citibank", period: "all", listings_closed: 325,
  feed_overlap: 87, still_advertised: 87, still_advertised_rate: 1,
  avg_days_still_advertised: 3, ad_pulled_after_close: 0,
  median_days_to_pull: null, median_observed_days: 35,
  ...over,
})

test("a withheld employer renders nothing at all", () => {
  // The index withheld it for too few observations. "No data" would be read as
  // reassurance we have not earned, so silence is the honest rendering.
  assert.equal(employerRecord("Citibank", [row({ still_advertised_rate: null })]), null)
  assert.equal(employerRecord("Citibank", []), null)
  assert.equal(employerRecord(null, [row({})]), null)
})

test("an employer not in the index renders nothing", () => {
  assert.equal(employerRecord("Some Startup", [row({})]), null)
})

test("company matching survives case and whitespace but never guesses", () => {
  assert.ok(employerRecord("  citibank ", [row({})]))
  assert.equal(employerRecord("Citi", [row({})]), null)
})

test("the sentence always names the denominator", () => {
  // A rate without the count it was taken over is the number this whole lane
  // exists to argue against.
  const r = employerRecord("Citibank", [row({})])!
  assert.match(r.text, /87 of 87 closed roles/)
})

test("only a pattern bad enough to change a decision warns", () => {
  assert.equal(employerRecord("Citibank", [row({ still_advertised_rate: 1 })])!.tone, "warn")
  assert.equal(employerRecord("Citibank", [row({ still_advertised_rate: 0.34 })])!.tone, "info")
  assert.equal(employerRecord("Citibank", [row({ still_advertised_rate: 0.05 })])!.tone, "good")
})

test("a clean employer is told to the user too", () => {
  // The index is not a shame list. An employer that takes ads down promptly is
  // information a jobseeker can act on.
  const r = employerRecord("Citibank", [row({ still_advertised_rate: 0, still_advertised: 0 })])!
  assert.match(r.text, /takes closed roles down promptly/)
})

test("the note reaches both skins from one model", () => {
  // Desktop and mobile cannot tell a user different things about one employer.
  const desktop = readFileSync("components/dashboard/detail-body.tsx", "utf8")
  const mobile = readFileSync("mobile/redesign/job-detail-sheet.tsx", "utf8")
  assert.match(desktop, /<EmployerRecordNote company=/)
  assert.match(mobile, /<EmployerRecordNote company=/)
})

test("the note links to how we know", () => {
  const note = readFileSync("components/jobs/employer-record-note.tsx", "utf8")
  assert.match(note, /href="\/ghost-index"/)
})

test("one shared index query, not one per job", () => {
  const note = readFileSync("components/jobs/employer-record-note.tsx", "utf8")
  assert.match(note, /queryKey: \["ghost-index", "companies"\]/)
})
