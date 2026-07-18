import { strict as assert } from "node:assert"
import test from "node:test"

import { FIELD_DICTIONARY, matchFact, planFill } from "../src/autofill.js"

test("matchFact maps common ATS labels to facts", () => {
  assert.equal(matchFact("Notice Period"), "notice_period_days")
  assert.equal(matchFact("Days to join"), "notice_period_days")
  assert.equal(matchFact("Current CTC"), "current_ctc_fixed_lpa")
  assert.equal(matchFact("Expected Salary"), "expected_ctc_lpa")
  assert.equal(matchFact("Salary Expectation"), "expected_ctc_lpa")
  assert.equal(matchFact("Current City"), "current_location")
  assert.equal(matchFact("Total Work Experience"), "total_experience_years")
})

test("matchFact returns null for unknown / empty labels", () => {
  assert.equal(matchFact("Favourite colour"), null)
  assert.equal(matchFact(""), null)
  assert.equal(matchFact(null), null)
})

test("'expected ctc' does NOT mis-match the current-ctc fact", () => {
  // 'expected' fields must resolve to expected, not current — the specific
  // 'expected' patterns exist; 'current ctc' pattern requires the word current.
  assert.equal(matchFact("Expected CTC"), "expected_ctc_lpa")
  assert.notEqual(matchFact("Expected CTC"), "current_ctc_fixed_lpa")
})

test("planFill fills known facts, leaves unknown facts blank", () => {
  const profile = { notice_period_days: 60, expected_ctc_lpa: 32 }
  const fields = [
    { id: "f1", label: "Notice Period" },
    { id: "f2", label: "Expected CTC" },
    { id: "f3", label: "Current CTC" }, // profile has no current ctc → skip
  ]
  const { fills } = planFill(profile, fields)
  assert.deepEqual(
    fills.map((f) => [f.id, f.fact, f.value]),
    [["f1", "notice_period_days", "60"], ["f2", "expected_ctc_lpa", "32"]],
  )
})

test("planFill never fills the same fact into two fields", () => {
  const profile = { current_ctc_fixed_lpa: 24 }
  const fields = [
    { id: "a", label: "Current CTC" },
    { id: "b", label: "Present CTC" }, // same fact
  ]
  const { fills } = planFill(profile, fields)
  assert.equal(fills.length, 1)
  assert.equal(fills[0].id, "a")
})

test("planFill surfaces labelled-but-unmatched fields for the LLM fallback", () => {
  const { fills, unmatched } = planFill(
    { notice_period_days: 30 },
    [
      { id: "a", label: "Notice Period" },
      { id: "b", label: "How soon can you relocate to Bangalore?" },
      { id: "c", label: "" }, // no label → not a fallback candidate
    ],
  )
  assert.equal(fills.length, 1)
  assert.deepEqual(unmatched, [{ id: "b", label: "How soon can you relocate to Bangalore?" }])
})

test("dictionary facts all carry a render fn and patterns", () => {
  for (const spec of FIELD_DICTIONARY) {
    assert.equal(typeof spec.render, "function")
    assert.ok(Array.isArray(spec.patterns) && spec.patterns.length > 0)
  }
})
