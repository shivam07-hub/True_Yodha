/**
 * The rules that decide whether a panel appears on a page nobody asked for it
 * on — and what it costs when it does.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { forwardPassState } from "../components/cv/builder/forward-pass-state"
import type { CareerProfile, ReservoirStatus } from "../lib/api"

const status = (pending: number, banked_recently: boolean): ReservoirStatus =>
  ({ pending, banked_recently })

const profile = (story_count: number): CareerProfile => ({
  roles: [],
  highlights: [],
  competencies: [],
  story_count,
  pending_inflows: 0,
  questions: [],
  questions_total: 0,
  questions_set_aside: 0,
  missing_number: 0,
  missing_story: 0,
})

test("nothing in flight and nothing recent renders nothing and polls nothing", () => {
  const s = forwardPassState(status(0, false), undefined)
  assert.equal(s.mode, "hidden")
  assert.equal(s.poll, false)
  assert.equal(s.wantsProfile, false, "the expensive read is not paid for a no-op")
})

test("an ingest in flight is the only thing worth saying, and it polls", () => {
  const s = forwardPassState(status(1, false), undefined)
  assert.equal(s.mode, "working")
  assert.equal(s.poll, true)
  assert.equal(s.wantsProfile, false, "there are no questions yet to fetch")
})

test("the poll stops the moment the count reaches zero", () => {
  assert.equal(forwardPassState(status(0, true), profile(3)).poll, false)
})

test("a CV that landed hands over its questions", () => {
  const s = forwardPassState(status(0, true), profile(8))
  assert.equal(s.mode, "landed")
  assert.equal(s.wantsProfile, true)
})

test("landed but the read has not returned shows nothing rather than a flash", () => {
  const s = forwardPassState(status(0, true), undefined)
  assert.equal(s.mode, "hidden")
  assert.equal(s.wantsProfile, true, "the read is still wanted — it just is not here")
})

test("an extraction that produced nothing announces nothing", () => {
  // A CV that is one line of contact details is a real outcome. "Your CV is now
  // 0 career stories" is worse than silence.
  assert.equal(forwardPassState(status(0, true), profile(0)).mode, "hidden")
})

test("before the first status lands the panel does not exist", () => {
  const s = forwardPassState(undefined, undefined)
  assert.equal(s.mode, "hidden")
  assert.equal(s.poll, false)
  assert.equal(s.wantsProfile, false)
})

test("in flight wins over a recent landing — one CV, one thing being said", () => {
  assert.equal(forwardPassState(status(2, true), profile(5)).mode, "working")
})
