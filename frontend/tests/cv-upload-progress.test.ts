import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  SLOW_AFTER_S,
  currentPhaseLabel,
  elapsedSeconds,
  formatElapsed,
  isSlow,
  revealVerdict,
} from "../lib/cv/upload-progress"

/**
 * The regression this file exists for: `SLOW_AFTER_MS = 75_000` was compared
 * against a value in SECONDS. The "still scoring" notice therefore needed
 * ~20.8 hours of waiting to appear, and in production it never appeared once.
 * `tsc` cannot see it (both sides are `number`), `eslint` cannot see it, and
 * the ui-drift guard reads file contents. Only an assertion about behaviour at
 * a real elapsed value catches it.
 */
test("the slow notice fires on the far side of a realistic wait, in SECONDS", () => {
  assert.equal(isSlow(SLOW_AFTER_S - 1), false)
  assert.equal(isSlow(SLOW_AFTER_S), true)

  // The bug, stated as an assertion: 76 is 76 seconds, not 76 milliseconds.
  // Under `elapsed >= 75_000` this was false and the notice stayed invisible.
  assert.equal(isSlow(76), true, "76 seconds is past the threshold")

  // And the threshold has to be a plausible wait, not an accidental ms value.
  // A unit slip turns this into 75_000, which is ~21 hours.
  assert.ok(SLOW_AFTER_S > 10 && SLOW_AFTER_S < 600, `SLOW_AFTER_S=${SLOW_AFTER_S} is not a plausible wait in seconds`)
})

test("elapsed is whole seconds and never renders a negative or NaN clock", () => {
  const t0 = Date.parse("2026-01-01T00:00:00.000Z")
  assert.equal(elapsedSeconds("2026-01-01T00:00:00.000Z", t0 + 16_000), 16)
  assert.equal(elapsedSeconds("2026-01-01T00:00:00.000Z", t0 + 16_999), 16, "partial seconds floor")

  // A clock skew must not print "-3s" next to the running step.
  assert.equal(elapsedSeconds("2026-01-01T00:00:10.000Z", t0), 0)
  assert.equal(elapsedSeconds("not-a-date", t0), 0)
  assert.equal(elapsedSeconds(null, t0), 0)
})

test("the counter is readable at every duration it can reach", () => {
  assert.equal(formatElapsed(0), "0s")
  assert.equal(formatElapsed(9), "9s")
  assert.equal(formatElapsed(59), "59s")
  assert.equal(formatElapsed(60), "1m 0s")
  assert.equal(formatElapsed(91), "1m 31s")
  assert.equal(formatElapsed(3661), "61m 1s")
  assert.equal(formatElapsed(-5), "0s", "a negative never reaches the screen")
})

test("progress copy follows persisted worker phases instead of a timer", () => {
  assert.equal(currentPhaseLabel("queued"), "Preparing your analysis")
  assert.equal(currentPhaseLabel("reading"), "Reading your CV")
  assert.equal(currentPhaseLabel("finding_skills"), "Extracting your skills")
  assert.equal(currentPhaseLabel("structuring_cv"), "Preparing your CV review")
  assert.equal(currentPhaseLabel(null), "Preparing your analysis")
})

test("every score band gets a verdict, and none of them is a judgement", () => {
  for (const score of [0, 39, 40, 59, 60, 79, 80, 100]) {
    const verdict = revealVerdict(score)
    assert.ok(verdict.length > 0, `no verdict at ${score}`)
    // ND1: lead with the path forward. These are the words that read as a
    // verdict on the person rather than on the next step.
    assert.doesNotMatch(verdict, /\b(bad|poor|weak|failing|terrible)\b/i, `judgemental verdict at ${score}`)
  }
  assert.notEqual(revealVerdict(85), revealVerdict(30), "bands must actually differ")
})

test("the component renders the model and does not re-derive thresholds", () => {
  // The whole point of the extraction. If a threshold or a unit conversion
  // creeps back into the component it is untestable again, and the next unit
  // slip ships exactly as this one did.
  const component = readFileSync(new URL("../components/cv/cv-score-progress.tsx", import.meta.url), "utf8")
  assert.doesNotMatch(component, /SLOW_AFTER_MS|75_000/, "threshold belongs in lib/cv/upload-progress")
  assert.doesNotMatch(component, /\/ 1000\b/, "seconds conversion belongs in lib/cv/upload-progress")
  assert.doesNotMatch(component, /setInterval\(\(\) => setI|SUBSTEP_MS|PARSE_STEPS/)
  assert.match(component, /from "@\/lib\/cv\/upload-progress"/)
})
