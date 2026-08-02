import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("onboarding routes CV evidence through skill confirmation before target and result", () => {
  const entry = read("app/onboarding/page.tsx")
  const result = read("app/onboarding/result/page.tsx")
  assert.match(entry, /ExperienceStep/)
  // The state is still a real stage of the pipeline; only its UI changed. The
  // blocking `<SkillConfirmation>` step was removed and the confirmation moved
  // onto the CV Skills rail (asserted below), so the result page now just
  // reports progress for this kind instead of owning the decision.
  assert.match(result, /awaiting_skill_confirmation/)
  assert.match(result, /awaiting_target/)
  assert.match(result, /TargetConfirm/)
})

test("description result remains an explicitly incomplete preview", () => {
  const preview = read("components/onboarding/profile-preview.tsx")
  assert.match(preview, /Profile Preview/)
  assert.match(preview, /Early estimate/)
  assert.match(preview, /Incomplete until Myro reads a full CV/)
  assert.doesNotMatch(preview, /Your Myro Score|Download/)
})

test("browsing jobs during onboarding opens the unpersonalized market in a new tab", () => {
  for (const path of [
    "components/onboarding/experience-step.tsx",
    "components/onboarding/profile-preview.tsx",
    "components/onboarding/analysis-progress.tsx",
  ]) {
    const source = read(path)
    assert.match(source, /href="\/market"/)
    assert.match(source, /target="_blank"/)
    assert.match(source, /rel="noopener noreferrer"/)
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

test("full result leads with proof and keeps correction available", () => {
  const result = read("components/onboarding/full-result.tsx")
  assert.match(result, /What Myro understood/)
  assert.match(result, /Your Myro Score/)
  assert.match(result, /SkillCorrectionSheet/)
  assert.doesNotMatch(result, /Download/)
})

test("skill confirmation is the score and matching trust gate", () => {
  // Moved, not removed: `components/onboarding/skill-confirmation.tsx` was
  // deleted when confirmation was folded into the CV Skills rail, so this read
  // ENOENT'd. The gate itself is the contract worth guarding — nothing may
  // publish skills into the score until the user confirms them — so it is
  // asserted at its new home rather than dropped with the old file.
  const rail = read("components/cv/builder/skills-rail.tsx")
  assert.match(rail, /onboarding\.confirmSkills/)
  assert.match(rail, /nothing is published yet/i, "confirm mode must not publish before the user confirms")
  assert.match(rail, /keptCount < 1/, "confirming an empty skill set must stay blocked")
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
