import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("onboarding routes CV evidence through skill confirmation before target and Market", () => {
  const entry = read("app/onboarding/page.tsx")
  const result = read("app/onboarding/result/page.tsx")
  assert.match(entry, /ExperienceStep/)
  assert.match(result, /awaiting_skill_confirmation/)
  assert.match(result, /FirstRunPlayground/)
  assert.match(result, /awaiting_target/)
  assert.match(result, /TargetConfirm/)
  assert.match(result, /onboarding_complete/)
  assert.match(result, /router\.replace\(result\.data\.redirect_to\)/)
  assert.doesNotMatch(result, /router\.replace\("\/cv\?edit=1&tab=skills&confirm=1"\)/)
})

test("a described profile takes the same path as an uploaded CV", () => {
  // There used to be a second text→baseline pipeline ending on an "Early estimate"
  // RANGE — a second scoring model beside the canonical Myro Score, on a screen
  // nobody reached (0 of 80 onboarding rows in 90 days). A description now builds a
  // real baseline through the same call /baseline/approve already used.
  const page = read("app/onboarding/page.tsx")
  assert.match(page, /onboarding\.approveBaseline/)
  assert.doesNotMatch(page, /profilePreview/)
  const step = read("components/onboarding/experience-step.tsx")
  assert.doesNotMatch(step, /Create preview/)
})

test("browsing jobs during onboarding opens a first-party market tab with the current session", () => {
  for (const path of [
    "components/onboarding/experience-step.tsx",
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

test("direction completes onboarding onto Market — no First role waiting room", () => {
  const result = read("app/onboarding/result/page.tsx")
  const journey = read("components/onboarding/journey-progress.tsx")
  assert.doesNotMatch(result, /FullResult/)
  assert.match(result, /onboarding_complete/)
  assert.match(journey, /Your CV/)
  assert.match(journey, /Direction/)
  assert.match(journey, /const STEPS = \["Your CV", "Direction"\]/)
  assert.doesNotMatch(journey, /const STEPS = \[[^\]]*First role/)
})

test("skill confirmation is the score and matching trust gate", () => {
  const review = read("components/onboarding/first-run-skill-review.tsx")
  const playground = read("components/onboarding/first-run-playground.tsx")
  const pane = read("components/onboarding/first-run-cv-pane.tsx")
  assert.match(review, /onboarding\.confirmSkills/)
  assert.match(review, /keptCount < 1/, "confirming an empty skill set must stay blocked")
  assert.match(playground, /\{chrome\.keptCount\}/, "the kept count must be rendered, not just computed")
  assert.match(playground, /disabled=\{chrome\.busy \|\| chrome\.keptCount < 1\}/, "confirm stays gated on the count")
  assert.match(playground, /Looks right/)
  assert.match(playground, /StickyOnboardingActionBar/)
  assert.match(playground, /PlaygroundHeader/)
  assert.match(playground, /FirstRunCvPane/)
  assert.match(playground, /cvb-v2-bottomnav/)
  assert.match(playground, /data-tab/)
  assert.match(pane, /Your Main CV/)
  assert.match(pane, /cvb-pgc-paper/)
  assert.match(pane, /versions\.list/, "first paint is a versions read, not an LLM GET")
  assert.match(pane, /body_text/, "the extracted CV is already on the row")
  assert.match(pane, /FirstRunCvBody/)
  assert.match(pane, /FirstRunCvPaperSkeleton/)
  assert.doesNotMatch(pane, /cv\.structured/)
  assert.doesNotMatch(pane, /Laying out|confirm skills now/)
  assert.doesNotMatch(review, /score/i, "step one must not promise a score before direction exists")
  assert.doesNotMatch(playground, /Myro Score/)
  assert.doesNotMatch(playground, /\/100/)
})

test("first-success checklist reads and dismisses durable server state", () => {
  const checklist = read("components/onboarding/first-success-checklist.tsx")
  // Mount moved /market → /collections in the Collections cutover.
  const host = read("app/(authed)/collections/page.tsx")
  assert.match(checklist, /onboarding\.checklist/)
  assert.match(checklist, /onboarding\.dismissChecklist/)
  assert.match(host, /FirstSuccessChecklist/)
})

test("accepted upload and target are persisted before Market navigation", () => {
  const page = read("app/onboarding/page.tsx")
  const target = read("components/onboarding/target-confirm.tsx")
  assert.match(page, /onboarding\.saveExperience/)
  assert.match(target, /onboarding\.saveTarget/)
  assert.match(target, /finish_onboarding:\s*true/)
  // The single "Choose your direction" page became four steps (the work,
  // level, where, about you) over the SAME state and the same one write. The
  // surface still names itself and still finishes at Market.
  assert.match(target, /Direction/)
  const steps = read("components/onboarding/target-steps.tsx")
  for (const title of ["The work", "Level", "Where", "About you"]) {
    assert.match(steps, new RegExp(`title="${title}"`), `${title} step is missing`)
  }
  assert.match(target, /Go to Market/)
  assert.match(target, /updateNinjaName/)
  // The name is claimed on the last step; the write still happens here, once.
  assert.match(read("components/onboarding/target-steps.tsx"), /Your Myro name/)
  assert.doesNotMatch(target, /What you qualify for|See my score|Building your score|Show my first shortlist|free match|free search/i)
  assert.match(page, /router\.push\("\/onboarding\/result"\)/)
  assert.doesNotMatch(page, /pollCVUploadStatus/)
  assert.match(page, /state\.isFetchedAfterMount/)
})

test("target choices stay editable and share the onboarding action lane", () => {
  const target = read("components/onboarding/target-confirm.tsx")
  const actionBar = read("components/onboarding/sticky-action-bar.tsx")
  // The lane is the same; what sits in it is now the chrome Myro Search uses,
  // so a fix to one surface's footer cannot leave the other behind.
  assert.match(target, /<StepActions/)
  assert.match(target, /<StepRibbon/)
  assert.match(read("components/onboarding/target-steps.tsx"), /aria-pressed=\{value === key\}/)
  assert.doesNotMatch(target, /setEditing|editing &&/)
  assert.match(target, /StickyOnboardingActionBar/)
  assert.match(actionBar, /fixed inset-x-0 bottom-0/)
  assert.match(actionBar, /safe-area-inset-bottom/)
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
