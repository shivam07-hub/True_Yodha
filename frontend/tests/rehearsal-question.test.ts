import assert from "node:assert/strict"
import test from "node:test"
import { toInterviewQuestion } from "../components/preparations/rehearse-panel"

/**
 * `jd_coverage` returns requirement phrases "as the JOB states them", which is
 * two grammatical shapes, not one. A single frame produced visible broken
 * English — "a time you senior stakeholder management up to executive
 * committee level" — on the primary content of step 3.
 */

test("a verb phrase becomes a behavioural question, with no conjugating", () => {
  assert.equal(
    toInterviewQuestion("Lead cross-functional programme delivery"),
    "Tell me about a time you had to lead cross-functional programme delivery.",
  )
  // "led"/"ran"/"built" is where irregular verbs would have broken it.
  assert.equal(
    toInterviewQuestion("Run the weekly ship review"),
    "Tell me about a time you had to run the weekly ship review.",
  )
})

test("a noun phrase takes the frame that can hold it", () => {
  assert.equal(
    toInterviewQuestion("Senior stakeholder management up to executive committee level"),
    "Tell me about your experience with senior stakeholder management up to executive committee level.",
  )
  assert.equal(
    toInterviewQuestion("Portfolio-level reporting and KPI governance"),
    "Tell me about your experience with portfolio-level reporting and KPI governance.",
  )
})

test("no requirement ever produces the broken frame", () => {
  const REAL = [
    "Lead cross-functional programme delivery across commercial and medical teams",
    "Senior stakeholder management up to executive committee level",
    "Change management across a matrixed pharma organisation",
    "Vendor and budget ownership above €2M",
    "Own quota and territory planning for enterprise accounts",
    "Risk and compliance sign-off",
    "Team leadership without direct authority",
  ]
  for (const r of REAL) {
    const q = toInterviewQuestion(r)
    assert.ok(q.endsWith("."), `no full stop: ${q}`)
    assert.ok(
      q.startsWith("Tell me about a time you had to ") ||
        q.startsWith("Tell me about your experience with "),
      `unknown frame: ${q}`,
    )
    // The bug, named: "you" immediately followed by the phrase.
    assert.doesNotMatch(q, /a time you (senior|change|vendor|team|risk|portfolio)\b/)
  }
})

test("the JD's own words survive the projection", () => {
  const q = toInterviewQuestion("Own quota and territory planning")
  assert.ok(q.includes("quota and territory planning"))
})

test("an empty requirement produces nothing, not a stub question", () => {
  assert.equal(toInterviewQuestion("   "), "")
})

test("trailing punctuation is not doubled", () => {
  assert.ok(!toInterviewQuestion("Own the roadmap.").includes(".."))
})
