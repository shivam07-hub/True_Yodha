/**
 * The standing completion queue's branching (#13 L3).
 *
 * These are the rules that decide whether a user trusts a standing queue:
 * an empty one shows nothing, a single question offers nothing to defer to,
 * the two rail counts always sum to the total, and a shrug is not an answer.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { canBank, MIN_ANSWER, questionsState } from "../components/cv/builder/story-questions-queue"
import type { StoryQuestion } from "../lib/api"

const Q = (id: string, kinds: StoryQuestion["kinds"] = ["number"]): StoryQuestion => ({
  story_id: id,
  title: "Patient data analysis",
  role_label: "Analyst · Medtronic",
  pointer: "Analyzed patient data using SQL, Excel, and Power BI to inform a device build",
  kinds,
  missing: ["a number — how big, how much, how many"],
  prompt: "How big was it?",
})

test("nothing to ask and nothing set aside renders no band at all", () => {
  assert.equal(questionsState([], 0, 0).hidden, true)
})

test("a finished queue still shows while bullets are set aside, so the way back stays visible", () => {
  const s = questionsState([], 6, 0)
  assert.equal(s.hidden, false)
  assert.equal(s.question, null)
})

test("one question offers no Later, since there is nothing to defer to", () => {
  assert.equal(questionsState([Q("s1")], 0, 0).canDefer, false)
  assert.equal(questionsState([Q("s1"), Q("s2")], 0, 0).canDefer, true)
})

test("Later wraps round the queue rather than running off the end", () => {
  const qs = [Q("s1"), Q("s2")]
  assert.equal(questionsState(qs, 0, 0).question?.story_id, "s1")
  assert.equal(questionsState(qs, 0, 1).question?.story_id, "s2")
  assert.equal(questionsState(qs, 0, 2).question?.story_id, "s1")
})

test("a negative cursor still lands on a real question", () => {
  assert.equal(questionsState([Q("s1"), Q("s2")], 0, -1).question?.story_id, "s2")
})

test("the queue is capped but the cursor only ever indexes what arrived", () => {
  const page = [Q("s1"), Q("s2"), Q("s3")]
  assert.equal(questionsState(page, 0, 7).question?.story_id, "s2")
})

test("a shrug is not an answer", () => {
  assert.equal(canBank("It was big."), false)
  assert.equal(canBank("   "), false)
  assert.equal(canBank("We covered 4,200 patients across three clinics."), true)
  assert.equal(MIN_ANSWER, 12)
})
