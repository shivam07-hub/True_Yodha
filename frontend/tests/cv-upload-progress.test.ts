import assert from "node:assert/strict"

import type { CVUploadPhase } from "../lib/cv-upload-state"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  JOB_ANALYSIS_PHASES,
  SLOW_AFTER_S,
  STALLED_AFTER_S,
  analysisView,
  currentPhaseLabel,
  elapsedSeconds,
  formatElapsed,
  isSlow,
  isStalled,
  revealVerdict,
  stepStateFor,
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

  // The original bug, stated as an assertion: these are SECONDS, not ms. Under
  // `elapsed >= 75_000` the notice needed ~21 hours and never once appeared.
  assert.ok(
    SLOW_AFTER_S > 10 && SLOW_AFTER_S < 600,
    `SLOW_AFTER_S=${SLOW_AFTER_S} is not a plausible wait in seconds`,
  )
  assert.ok(
    STALLED_AFTER_S > SLOW_AFTER_S && STALLED_AFTER_S < 600,
    "stalled must sit past slow, and still be a plausible wait in seconds",
  )
})

test("\"slower than usual\" is only said when it is true", () => {
  // Prod, 30 days to 2026-08-04: p50 48s, p90 109s. The onboarding surface warned
  // at 40s — before the median — so it fired on most uploads while the pipeline
  // was behaving perfectly. A warning that common is background, not information.
  const P50 = 48
  const P90 = 109
  assert.equal(isSlow(P50), false, "the median wait is by definition usual")
  assert.ok(SLOW_AFTER_S > P50 * 1.5, "the threshold must clear the median by a real margin")
  assert.ok(SLOW_AFTER_S <= P90, "but must still fire inside the tail it exists to explain")
})

test("slow and stalled are different claims and never both true", () => {
  // They say incompatible things — "still working" versus "this should have
  // finished". Overlapping them would render a reassurance and a warning at once.
  for (const seconds of [0, SLOW_AFTER_S - 1, SLOW_AFTER_S, STALLED_AFTER_S - 1, STALLED_AFTER_S, 600]) {
    assert.ok(!(isSlow(seconds) && isStalled(seconds)), `both fired at ${seconds}s`)
  }
  assert.equal(isStalled(STALLED_AFTER_S), true)
  assert.equal(isSlow(STALLED_AFTER_S), false, "past stalled, the slow copy is superseded")
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
  assert.equal(currentPhaseLabel("saving"), "Saving your analysis")
  assert.equal(currentPhaseLabel("structuring_cv"), "Preparing your CV review")
  assert.equal(currentPhaseLabel(null), "Preparing your analysis")
})

test("the ladder only contains phases the worker actually writes", () => {
  // A step for a phase nobody emits is a step that never lights: the same lie as
  // a timer, told more slowly. `reading` happens before the job is accepted and
  // `structuring_cv` moved off the critical path, so neither is ever persisted.
  assert.deepEqual([...JOB_ANALYSIS_PHASES], ["queued", "finding_skills", "saving"])
})

test("the ladder walks forward with the phase and never walks back", () => {
  const at = (phase: CVUploadPhase) => JOB_ANALYSIS_PHASES.map((_, i) => stepStateFor(phase, i))
  assert.deepEqual(at("queued"), ["active", "pending", "pending"])
  assert.deepEqual(at("finding_skills"), ["done", "active", "pending"])
  assert.deepEqual(at("saving"), ["done", "done", "active"])
  // The terminal poll lands one tick before the surface swaps to its result.
  // Nothing should still be pulsing when everything is finished.
  assert.deepEqual(at("ready"), ["done", "done", "done"])
})

test("an unknown phase degrades to the start of the ladder, never to a blank", () => {
  // A legacy row, or a phase added server-side before this client shipped. Work
  // is happening either way; the ladder just cannot say how far along it is.
  assert.deepEqual(
    JOB_ANALYSIS_PHASES.map((_, i) => stepStateFor("structuring_cv", i)),
    ["active", "pending", "pending"],
  )
  assert.deepEqual(
    JOB_ANALYSIS_PHASES.map((_, i) => stepStateFor(null, i)),
    ["active", "pending", "pending"],
  )
})

test("the logged-out preview claims exactly one step, because it can see one", () => {
  // It is ONE blocking POST that extracts, parses and scores server-side. The
  // three-stage console that used to render here ticked itself off every 1400ms
  // from a setInterval — it would show all three complete on a request that had
  // failed. Observability, not decoration, decides how many steps exist.
  const view = analysisView({ kind: "request", secondsInPhase: 3 })
  assert.equal(view.steps.length, 1)
  assert.equal(view.steps[0].state, "active")
  assert.equal(view.steps[0].label, "Reading your CV")
})

test("a healthy wait is not interrupted with reassurance", () => {
  // The scan sweep and the live counter already say "working". A sentence on top
  // of them is noise that trains people to ignore the one message that matters.
  assert.equal(analysisView({ kind: "job", phase: "finding_skills", secondsInPhase: 20 }).note, null)
  assert.equal(analysisView({ kind: "job", phase: "finding_skills", secondsInPhase: 48 }).note, null)
})

test("a stalled wait stops claiming progress and admits it", () => {
  const view = analysisView({ kind: "job", phase: "finding_skills", secondsInPhase: STALLED_AFTER_S })
  assert.equal(view.stalled, true)
  assert.match(view.headline, /longer than it should/i)
  assert.match(view.note ?? "", /nothing is lost/i)
  assert.doesNotMatch(view.note ?? "", /still working/i, "past stalled, 'still working' is not credible")
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

test("no surface re-derives a threshold, a unit, or a stage of its own", () => {
  // The whole point of the extraction. If a threshold or a unit conversion
  // creeps back into a component it is untestable again, and the next unit slip
  // ships exactly as this one did. Applied to all three surfaces now, because
  // divergence is how the preview ended up narrating from a timer.
  for (const path of [
    "../components/cv/analysis-stage.tsx",
    "../components/cv/cv-score-progress.tsx",
    "../components/onboarding/analysis-progress.tsx",
    "../components/public/cv-preview/scoring-console.tsx",
  ]) {
    const component = readFileSync(new URL(path, import.meta.url), "utf8")
    assert.doesNotMatch(component, /SLOW_AFTER_MS|75_000|40_000|100_000/, `threshold literal in ${path}`)
    assert.doesNotMatch(component, /\/ 1000\b/, `seconds conversion in ${path}`)
    assert.doesNotMatch(component, /PHASES\s*[:=]\s*\{/, `a second phase-label map in ${path}`)
  }
})

test("only the shared stage owns a clock, and it never advances the ladder", () => {
  const stage = readFileSync(new URL("../components/cv/analysis-stage.tsx", import.meta.url), "utf8")
  // A timer that moves the STEP is the fabricated-progress defect. A timer that
  // moves the CLOCK is a fact about the user's wait. The difference is whether
  // the interval callback touches step state — here it only re-reads `now`.
  assert.match(stage, /setInterval\(\(\) => setNow\(Date\.now\(\)\), 1_000\)/)
  assert.equal(
    (stage.match(/setInterval/g) ?? []).length, 1,
    "one clock for the whole surface",
  )
  assert.doesNotMatch(stage, /setActive|setStep|setI\b/, "no timer may advance the ladder")

  for (const path of [
    "../components/onboarding/analysis-progress.tsx",
    "../components/public/cv-preview/scoring-console.tsx",
  ]) {
    const component = readFileSync(new URL(path, import.meta.url), "utf8")
    // The CALL form, not the word: these files explain in prose what timer was
    // removed from them, and a gate that cannot tell code from its own history
    // note gets edited away the first time it is inconvenient.
    assert.doesNotMatch(component, /setInterval\(/, `${path} must not run a second clock`)
    assert.match(component, /CvAnalysisStage/, `${path} must render the shared wait`)
  }
})
