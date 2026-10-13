import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("partner consent enters onboarding, which owns the finished-journey redirect", () => {
  const connect = read("app/connect/[partner]/page.tsx")
  const onboarding = read("app/onboarding/page.tsx")
  const callback = read("app/auth/callback/page.tsx")

  // Already signed in: one click. Used to replace straight to /market.
  assert.match(connect, /router\.replace\("\/onboarding"\)/)
  assert.doesNotMatch(connect, /router\.replace\("\/market"\)/)

  // One rule, on the upload page. A finished journey still reaches /market;
  // work in flight resumes on the result screen; no CV stays here.
  assert.match(onboarding, /position === "completed"[\s\S]*router\.replace\("\/market"\)/)
  assert.match(onboarding, /position === "result"\) router\.replace\("\/onboarding\/result"\)/)

  // Not signed in: Google, and the emailed fallback, both return through the
  // callback carrying link_partner. That is a consent completion too.
  assert.match(callback, /completingPartnerLink: Boolean\(searchParams\.get\("link_partner"\)\)/)
})
