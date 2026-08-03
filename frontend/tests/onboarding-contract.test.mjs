import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("onboarding routes CV evidence through skill confirmation before target and result", () => {
  const entry = read("app/onboarding/page.tsx")
  const result = read("app/onboarding/result/page.tsx")
  assert.match(entry, /ExperienceStep/)
  assert.match(result, /awaiting_skill_confirmation/)
  assert.match(result, /FirstRunSkillReview/)
  assert.match(result, /awaiting_target/)
  assert.match(result, /TargetConfirm/)
  assert.match(result, /first_role_saved/)
  assert.match(result, /FirstRoleSuccess/)
  assert.doesNotMatch(result, /router\.replace\("\/cv\?edit=1&tab=skills&confirm=1"\)/)
})

test("description result remains an explicitly incomplete preview", () => {
  const preview = read("components/onboarding/profile-preview.tsx")
  assert.match(preview, /Profile Preview/)
  assert.match(preview, /Early estimate/)
  assert.match(preview, /Incomplete until Myro reads a full CV/)
  assert.doesNotMatch(preview, /Your Myro Score|Download/)
})

test("browsing jobs during onboarding opens a first-party market tab with the current session", () => {
  for (const path of [
    "components/onboarding/experience-step.tsx",
    "components/onboarding/profile-preview.tsx",
    "components/onboarding/analysis-progress.tsx",
  ]) {
    const source = read(path)
    assert.match(source, /href="\/market"/)
    assert.match(source, /target="_blank"/)
    // `noopener` prevents the sessionStorage clone that lets the new, same-origin
    // Myro tab continue the authenticated journey. This relationship is limited
    // to the relative /market destination and detached on destination boot.
    assert.match(source, /rel="opener"/)
    assert.doesNotMatch(source, /rel="noopener noreferrer"/)
    assert.match(source, /ExternalLink/)
  }
})

test("skill confirmation transition never pretends to be scoring", () => {
  const result = read("app/onboarding/result/page.tsx")
  assert.doesNotMatch(
    result,
    /awaiting_skill_confirmation"\) return <AnalysisProgress phase="scoring"/,
  )
})

test("baseline generator fixes the five-question expectation", () => {
  const generator = read("components/onboarding/baseline-generator.tsx")
  assert.match(generator, /5 questions · about 2 minutes/)
  assert.match(generator, /Question \{step\} of 5/)
  assert.match(generator, /Review your starter CV/)
  assert.match(generator, /Approve baseline/)
})

test("full result is a focused live-role decision, not a score dashboard", () => {
  const result = read("components/onboarding/full-result.tsx")
  assert.match(result, /Your first live shortlist/)
  assert.match(result, /ResultMatches/)
  assert.doesNotMatch(result, /Your Myro Score|ScoreMapPreview|SkillCorrectionSheet|Download/)
})

test("skill confirmation is the score and matching trust gate", () => {
  const review = read("components/onboarding/first-run-skill-review.tsx")
  assert.match(review, /onboarding\.confirmSkills/)
  assert.match(review, /keptCount < 1/, "confirming an empty skill set must stay blocked")
  // The invariant is that the user confirms a COUNT they can see, not a vague
  // "OK" — it used to live inside the button label ("These ${keptCount} skills
  // look right"). The 2026-08-03 redesign moved the number out of the label and
  // into the sticky bar beside it, where it is larger and no longer competes
  // with the action. Assert the number is rendered, not the sentence it once
  // sat in; a copy edit should not fail this, deleting the count should.
  assert.match(review, /\{keptCount\}/, "the kept count must be rendered, not just computed")
  assert.match(review, /disabled=\{busy \|\| keptCount < 1\}/, "confirm stays gated on the count")
  assert.doesNotMatch(review, /score/i, "step one must not promise a score before direction exists")
})

test("first-success checklist reads and dismisses durable server state", () => {
  const checklist = read("components/onboarding/first-success-checklist.tsx")
  // Mount moved /market → /collections in the Collections cutover.
  const host = read("app/(authed)/collections/page.tsx")
  assert.match(checklist, /onboarding\.checklist/)
  assert.match(checklist, /onboarding\.dismissChecklist/)
  assert.match(host, /FirstSuccessChecklist/)
})

test("accepted upload and target are persisted before result navigation", () => {
  const page = read("app/onboarding/page.tsx")
  const target = read("components/onboarding/target-confirm.tsx")
  assert.match(page, /onboarding\.saveExperience/)
  assert.match(target, /onboarding\.saveTarget/)
  assert.match(target, /Choose your direction/)
  assert.match(target, /Show my first shortlist/)
  assert.doesNotMatch(target, /What you qualify for|See my score|Building your score/)
  assert.match(page, /router\.push\("\/onboarding\/result"\)/)
  assert.doesNotMatch(page, /pollCVUploadStatus/)
  assert.match(page, /state\.isFetchedAfterMount/)
})

test("progressive personalization derives the post-score three-move triad", () => {
  // The old /home three-action checklist retired with the dashboard
  // (Collections cutover 2026-07-07). Its successor is the #146 triad —
  // one skill · one job · one CV move — derived from the user's own score
  // and consumed by the /market Command Rail.
  const triad = read("lib/onboarding/next-best-steps.ts")
  assert.match(triad, /kind: "skill"/)
  assert.match(triad, /kind: "job"/)
  assert.match(triad, /kind: "cv"/)
  const rail = read("components/mission-control/mission-hero-rail.tsx")
  assert.match(rail, /deriveNextBestSteps/)
})
