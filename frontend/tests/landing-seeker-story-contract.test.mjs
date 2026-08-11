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
  const heroEngine = read("components/public/landing/hero-engine.tsx")
  const companyRail = read("components/public/landing/company-rail.tsx")
  const motion = read("components/public/landing/landing-motion.css")
  const match = read("components/public/landing/how-it-works.tsx")
  const plan = read("components/public/landing/application-plan.tsx")

  assert.match(hero, /Prepare for MNC jobs hiring in India/)
  assert.match(hero, /LandingHeroEngine/)
  assert.match(heroEngine, /The Myro Engine/)
  assert.match(heroEngine, /Scores shown are examples/)
  assert.match(companyRail, /Read live from/)
  assert.match(companyRail, /company career pages/)
  assert.match(heroEngine, /useAllowLoopingMotion/)
  assert.match(companyRail, /useAllowLoopingMotion/)
  assert.match(companyRail, /\[0, 1\]\.map/)
  assert.match(motion, /lp-company-rail-run/)
  assert.match(motion, /lp-engine-core-turn/)
  assert.match(motion, /prefers-reduced-motion: no-preference/)
  assert.match(match, /Live source/)
  assert.match(match, /company career pages/)
  assert.match(match, /Tailor &amp; apply/)
  assert.match(plan, /Applied\. Now prepare for this role/)
  assert.ok(
    hero.indexOf("<LandingStats") < hero.indexOf("lp-hero-inner"),
    "the credibility metrics should sit above the hero content",
  )

  assert.match(landing, /LandingApplicationPlan/)
  assert.ok(
    landing.indexOf("<LandingCompanyRail") > landing.indexOf("<LandingHero"),
    "the live company rail should sit immediately after the hero",
  )
  assert.ok(
    landing.indexOf("<LandingCompanyRail") < landing.indexOf("<LandingHowItWorks"),
    "the company rail should precede the merged source and tailoring story",
  )
  assert.doesNotMatch(landing, /LandingJobSearch|LandingDomains/)
  assert.doesNotMatch(hero, /Career Intelligence Platform|10 minutes|See the Engine/)
})

test("the landing upload keeps the canonical anonymous preview handoff", () => {
  const dropzone = read("components/public/landing/dropzone.tsx")

  assert.match(dropzone, /router\.push\("\/cv-preview"\)/)
})
