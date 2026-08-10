import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const frontendRoot = process.cwd()

function read(path) {
  return readFileSync(join(frontendRoot, path), "utf8")
}

test("the public landing tells the seeker-first MNC story without product-manual sections", () => {
  const landing = read("components/public/landing-page.tsx")
  const hero = read("components/public/landing/hero.tsx")
  const match = read("components/public/landing/how-it-works.tsx")
  const plan = read("components/public/landing/application-plan.tsx")

  assert.match(hero, /Prepare for MNC jobs hiring in India/)
  assert.match(hero, /MNC hiring, read at the source/)
  assert.match(hero, /Jobs matched to your CV/)
  assert.match(match, /Tailor &amp; apply/)
  assert.match(plan, /Applied\. Now prepare for this role/)

  assert.match(landing, /LandingApplicationPlan/)
  assert.doesNotMatch(landing, /LandingJobSearch|LandingDomains/)
  assert.doesNotMatch(hero, /Career Intelligence Platform|10 minutes|See the Engine/)
})

test("the landing upload keeps the canonical anonymous preview handoff", () => {
  const dropzone = read("components/public/landing/dropzone.tsx")

  assert.match(dropzone, /router\.push\("\/cv-preview"\)/)
})
