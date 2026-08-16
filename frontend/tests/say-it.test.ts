/**
 * Screen 1's copy and chips are the first thing a user judges Myro on.
 * If these slip, the pad invites a paragraph it cannot show, and the CV
 * chips rebuild the form the conversation was meant to replace.
 */
import { strict as assert } from "node:assert"
import { test } from "node:test"

import {
  appendStarter,
  cvReadCopy,
  remainingHint,
  rolesWaitingCopy,
  searchCostCopy,
  uniqueStarters,
} from "../lib/preflight/say-it"

test("IT Sales and tech sales are the same chip", () => {
  assert.deepEqual(
    uniqueStarters(["tech sales", "IT Sales", "Technical Account Manager", "Bengaluru"]),
    ["tech sales", "Technical Account Manager", "Bengaluru"],
  )
})

test("case-only duplicates collapse, first casing wins", () => {
  assert.deepEqual(uniqueStarters(["Bengaluru", "bengaluru", "BENGALURU"]), ["Bengaluru"])
})

test("a tap appends as speech, not a comma list", () => {
  assert.equal(appendStarter("", "tech sales"), "tech sales")
  assert.equal(appendStarter("Gurgaon", "B2B"), "Gurgaon B2B")
  assert.equal(appendStarter("tech sales", "tech sales"), "tech sales")
})

test("the remaining-chars hint stays quiet until 80% of the cap", () => {
  assert.equal(remainingHint(479, 600), null)
  assert.equal(remainingHint(480, 600), "120 left")
  assert.equal(remainingHint(600, 600), "0 left")
  assert.equal(remainingHint(900), null)
})

test("roles waiting are a number with a reason, never a zero", () => {
  assert.equal(rolesWaitingCopy(0), null)
  assert.deepEqual(rolesWaitingCopy(4200), {
    n: "4,200",
    lede: "roles landed since your last search. None of them are sorted yet.",
  })
})

test("the CV read is a claim, not a builder footnote", () => {
  assert.match(cvReadCopy(true, 75) ?? "", /75 things you've told me/)
  assert.doesNotMatch(cvReadCopy(true, 75) ?? "", /notes/)
  assert.equal(cvReadCopy(false, 0), null)
})

test("the search price is on screen 1, in the same words as review", () => {
  assert.deepEqual(searchCostCopy(0, 40), { text: "Free", short: false })
  assert.deepEqual(searchCostCopy(150, 200), { text: "150 Myro Coins", short: false })
  assert.deepEqual(searchCostCopy(150, 40), { text: "Need 150 · you have 40", short: true })
})
