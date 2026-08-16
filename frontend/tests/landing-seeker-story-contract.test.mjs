import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const frontendRoot = process.cwd()

function read(path) {
  return readFileSync(join(frontendRoot, path), "utf8")
}

test("the public landing tells the seeker-first MNC story through one CV Hub", () => {
  const landing = read("components/public/landing-page.tsx")
  const hero = read("components/public/landing/hero.tsx")
  const hub = read("components/public/landing/cv-hub.tsx")
  const companyRail = read("components/public/landing/company-rail.tsx")
  const motion = read("components/public/landing/landing-motion.css")
  const match = read("components/public/landing/how-it-works.tsx")
  const plan = read("components/public/landing/application-plan.tsx")
  const score = read("components/public/landing/score-sample.tsx")

  assert.match(hero, /Prepare for MNC jobs hiring in India/)
  assert.match(hero, /LandingCvHub/)
  assert.doesNotMatch(hero, /LandingHeroEngine|LandingDropzone/)
  assert.match(hub, /role="tablist"/)
  assert.match(hub, /Get your Myro Score/)
  assert.match(hub, /Tailor and apply/)
  assert.match(hub, /id="cv-hub"/)
  assert.match(hub, /LandingDropzone/)
  assert.match(hub, /lp-hub-drop/)
  assert.doesNotMatch(hub, /lp-hub-tab-upload/)
  assert.match(hub, /LandingScoreSample/)
  assert.match(hub, /LandingMatchSample/)
  assert.match(hub, /LandingPlanSample/)
  assert.match(score, /Example Myro Score/)
  assert.match(match, /Live source/)
  assert.match(match, /company career pages/)
  assert.match(match, /Tailor &amp; apply/)
  assert.match(plan, /Applied/)
  assert.match(companyRail, /Read live from/)
  assert.match(companyRail, /company career pages/)
  assert.match(companyRail, /useAllowLoopingMotion/)
  assert.match(companyRail, /\[0, 1\]\.map/)
  assert.match(motion, /lp-company-rail-run/)
  assert.match(motion, /prefers-reduced-motion: no-preference/)
  assert.ok(
    hero.indexOf("<LandingStats") < hero.indexOf("lp-hero-inner"),
    "the credibility metrics should sit above the hero content",
  )

  assert.doesNotMatch(landing, /LandingClosing|LandingHowItWorks|LandingApplicationPlan/)
  assert.ok(
    landing.indexOf("<LandingCompanyRail") > landing.indexOf("<LandingHero"),
    "the live company rail should sit immediately after the hero",
  )
  assert.match(landing, /LandingJobSearch/)
  assert.ok(
    landing.indexOf("<LandingLiveMirror") < landing.indexOf("<LandingJobSearch"),
    "the search/industry shortcut should follow the live-mirror proof",
  )
  assert.doesNotMatch(landing, /LandingDomains/)
  assert.doesNotMatch(hero, /Career Intelligence Platform|10 minutes|See the Engine/)
})

test("the landing upload keeps the canonical anonymous preview handoff", () => {
  const dropzone = read("components/public/landing/dropzone.tsx")
  const landing = read("components/public/landing-page.tsx")
  const hub = read("components/public/landing/cv-hub.tsx")

  assert.match(dropzone, /router\.push\("\/cv-preview"\)/)
  assert.match(dropzone, /No CV\? Paste your CV text/)
  assert.match(hub, /Browse jobs instead/)
  assert.doesNotMatch(landing, /landing_dropzone_closing/)
})
