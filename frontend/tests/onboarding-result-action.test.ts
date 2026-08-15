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
