/**
 * Stories review space — what the band shows, and when it shows nothing.
 *
 * The reservoir is the Master CV, so a duplicate question is not decoration:
 * it decides whether two entries stay two lines on a tailored CV or become one
 * (ADR-0021). The rules this pins:
 *
 *   · nothing waiting AND nothing done  → the band does not render. An empty
 *     queue is not a state worth a card.
 *   · anything done (a fold Myro made, a ruling the user gave) keeps the band
 *     alive even with no question left — that receipt is how a silent mutation
 *     stops being silent.
 *   · story questions come before role questions, one at a time, and "Later"
 *     wraps rather than running off the end of the queue.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { reviewState } from "../components/cv/builder/story-review-queue"
import type { MergeSuggestion, ReviewView, StoryPair } from "../lib/api"

const pair = (a: string, b: string): StoryPair => ({
  story_a: a,
  story_b: b,
  a: { id: a, title: `Story ${a}`, role_label: "Capgemini", pointer: "", variant_count: 1 },
  b: { id: b, title: `Story ${b}`, role_label: "Capgemini", pointer: "", variant_count: 1 },
})

const rolePair = (a: string, b: string): MergeSuggestion => ({
  role_a: a, role_b: b, a_label: `Role ${a}`, b_label: `Role ${b}`,
})

const view = (over: Partial<ReviewView> = {}): ReviewView => ({
  story_pairs: [], role_pairs: [], merged_for_you: [], you_decided: 0, tidied_roles: 0, ...over,
})

test("an empty queue with nothing done renders nothing", () => {
  assert.equal(reviewState(view(), 0).hidden, true)
  assert.equal(reviewState(undefined, 0).hidden, true)
})

test("a fold Myro made keeps the band alive with no question left", () => {
  const done = view({
    merged_for_you: [{ story_a: "a", story_b: "b", kept: "Kept", merged: "Merged", when: "" }],
  })
  assert.equal(reviewState(done, 0).hidden, false)
  assert.equal(reviewState(view({ you_decided: 1 }), 0).hidden, false)
  assert.equal(reviewState(view({ tidied_roles: 2 }), 0).hidden, false)
})

test("story questions come first, then roles, one at a time", () => {
  const data = view({ story_pairs: [pair("s1", "s2")], role_pairs: [rolePair("r1", "r2")] })
  const first = reviewState(data, 0)
  assert.equal(first.waiting, 2)
  assert.equal(first.pair?.story_a, "s1")
  assert.equal(first.rolePair, null)

  const second = reviewState(data, 1)
  assert.equal(second.pair, null)
  assert.equal(second.rolePair?.role_a, "r1")
})

test("Later wraps instead of running off the end", () => {
  const data = view({ story_pairs: [pair("s1", "s2"), pair("s3", "s4")] })
  assert.equal(reviewState(data, 2).pair?.story_a, "s1")
  assert.equal(reviewState(data, 3).pair?.story_a, "s3")
})

test("a queue that empties under the cursor still resolves", () => {
  const data = view({ story_pairs: [], you_decided: 4 })
  const state = reviewState(data, 7)
  assert.equal(state.hidden, false)
  assert.equal(state.waiting, 0)
  assert.equal(state.pair, null)
  assert.equal(state.rolePair, null)
})
