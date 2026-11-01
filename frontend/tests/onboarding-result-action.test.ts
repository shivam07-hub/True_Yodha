import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const frontendRoot = process.cwd()
const read = (path: string) => readFileSync(join(frontendRoot, path), "utf8")

test("direction completes onto Market with a claimed Myro name", () => {
  const target = read("components/onboarding/target-confirm.tsx")
  const page = read("app/onboarding/result/page.tsx")

  assert.match(target, /updateNinjaName/)
  assert.match(target, /router\.replace\("\/market"\)/)
  assert.match(target, /Go to Market/)
  assert.match(page, /onboarding_complete/)
  assert.doesNotMatch(page, /FullResult/)
})

test("Market teaches tailor with a dismissible coach tip", () => {
  const coach = read("components/market/market-tailor-coach.tsx")
  const market = read("app/(authed)/market/page.tsx")

  assert.match(coach, /Open a role, then tailor your CV/)
  assert.match(coach, /myro\.market\.tailor-coach\.dismissed/)
  assert.match(market, /MarketTailorCoach/)
})

test("the Market tip reads the direction, never a stored flag", () => {
  const market = read("app/(authed)/market/page.tsx")

  assert.match(market, /<MarketTailorCoach enabled=\{profileData\?\.direction\?\.is_set \?\? false\} \/>/)
  assert.doesNotMatch(read("lib/api.ts"), /^\s*onboarding_complete: boolean/m)
})

test("someone who finished on a job reaches the role picker from the one door", () => {
  const entry = read("app/onboarding/page.tsx")
  const page = read("app/onboarding/result/page.tsx")

  // Plain /onboarding/result is their tailor receipt, so the door names the step.
  assert.match(entry, /position === "direction"\) \{ router\.replace\("\/onboarding\/result\?step=2"\)/)
  assert.match(page, /useState<number \| null>\(\s*\(\) => searchParams\.get\("step"\) === "2" \? 2 : null,?\s*\)/)
})

test("the client calls no onboarding write that was removed", () => {
  const api = read("lib/api.ts")

  assert.doesNotMatch(api, /markMilestone|\/onboarding\/activate|\/onboarding\/milestones/)
  assert.doesNotMatch(api, /tailored_cv_created_at|score_gap_reviewed_at|activation_kind/)
})

test("a failed result fetch stops loading and offers a retry", () => {
  const page = read("app/onboarding/result/page.tsx")

  assert.match(page, /result\.isError/)
  assert.match(page, /Couldn&apos;t load your next step/)
  assert.match(page, /result\.refetch\(\)/)
})

test("result page does not poll for a shortlist wait", () => {
  const page = read("app/onboarding/result/page.tsx")

  assert.match(page, /journey_step === 1/)
  assert.doesNotMatch(page, /shortlist_status === "computing"/)
  assert.doesNotMatch(page, /2_500|2_000/)
})
