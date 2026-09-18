import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8")

const direction = read("components/onboarding/target-confirm.tsx")
const confirmStep = read("components/onboarding/first-run-skill-review.tsx")

/**
 * The last step of onboarding must say how it ended.
 *
 * `cv_upload_phase_events` held 45 `direction` rows in production and every one
 * of them was `started`. Every other phase carries a terminal outcome — `pick`
 * 336/336, `parse` 344 succeeded and 22 failed, `confirm` 23 and 1. Direction
 * had none, so a save that threw, a Myro name that failed its regex, and a
 * person who simply closed the tab were the same row.
 *
 * That is not an abstract gap. 5 of the 26 people who have reached Direction
 * left without a target, and the table cannot say which kind of leaving any of
 * them was. A step nobody can measure is a step nobody can fix.
 *
 * Every assertion below matches the CALL, not the word. The explanations in the
 * component name these outcomes in prose, and a bare-name grep would pass on the
 * comment while the emit was missing.
 */

test("a saved direction is recorded as succeeded", () => {
  assert.match(
    direction,
    /emitJourneyPhase\(token, "direction", "succeeded"/,
    "Direction never records a successful save",
  )
})

test("succeeded is emitted after the write, not on the way to it", () => {
  const save = direction.indexOf("onboarding.saveTarget(")
  const success = direction.indexOf('emitJourneyPhase(token, "direction", "succeeded"')
  assert.ok(save > -1, "saveTarget call not found — this test is reading the wrong file")
  assert.ok(success > -1, "no succeeded emit to order")
  assert.ok(
    success > save,
    "succeeded is emitted before saveTarget resolves, so it would claim a target that was never written",
  )
})

test("a thrown save is recorded as failed, carrying the reason", () => {
  assert.match(
    direction,
    /emitJourneyPhase\(token, "direction", "failed", \{ errorDetail: detail \}\)/,
    "the catch swallows the failure — an error the user saw that telemetry did not",
  )
})

test("one attempt never writes both a succeeded and a failed row", () => {
  // Four things run inside the same `try` AFTER saveTarget resolves — the cache
  // invalidation, the analytics event, the handoff and the navigation. An
  // unguarded catch turns any of their throws into a `failed` row for a target
  // that is already in the database, and the two rows cannot both be true.
  assert.match(direction, /let saved = false/, "nothing records that the write landed")
  assert.match(
    direction,
    /saved = true\s*\n\s*emitJourneyPhase\(token, "direction", "succeeded"/,
    "the flag must be set on the same beat as the succeeded emit, not later",
  )
  assert.match(
    direction,
    /if \(!saved\) emitJourneyPhase\(token, "direction", "failed"/,
    "the catch emits failed unconditionally — a post-save throw would contradict its own succeeded row",
  )
})

test("an invalid Myro name is a failure, not a silence", () => {
  // The button is enabled by the same regex this branch re-tests, so reaching it
  // means the user pressed Save and nothing was written. Without its own outcome
  // it is indistinguishable from never pressing the button at all.
  assert.match(
    direction,
    /emitJourneyPhase\(token, "direction", "failed", \{ reasonCode: "ninja_name_invalid" \}\)/,
    "the Myro name dead end leaves no record",
  )
})

test("Direction carries the same three outcomes the step before it does", () => {
  // `confirm` is the reference implementation: started on mount, succeeded after
  // the write, failed in the catch. Direction is the last step of the journey and
  // is held to the contract its predecessor already meets.
  for (const outcome of ["started", "succeeded", "failed"] as const) {
    assert.match(
      confirmStep,
      new RegExp(`emitJourneyPhase\\(token, "confirm", "${outcome}"`),
      `the reference step lost its ${outcome} emit — update this test deliberately, not by copying`,
    )
    assert.match(
      direction,
      new RegExp(`emitJourneyPhase\\(token, "direction", "${outcome}"`),
      `Direction is missing its ${outcome} emit`,
    )
  }
})
