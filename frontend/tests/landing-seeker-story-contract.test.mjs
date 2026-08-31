import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const frontendRoot = process.cwd()

function read(path) {
  return readFileSync(join(frontendRoot, path), "utf8")
}

test("the public landing runs the operation story: hero dropzone + four-tab loop", () => {
  const landing = read("components/public/landing-page.tsx")
  const hero = read("components/public/landing/hero.tsx")
  const hub = read("components/public/landing/use-cases.tsx")
  const companyRail = read("components/public/landing/company-rail.tsx")
  const motion = read("components/public/landing/landing-motion.css")
  const match = read("components/public/landing/how-it-works.tsx")
  const score = read("components/public/landing/score-sample.tsx")

  // Hero owns the thesis + the dropzone + the two audience paths.
  assert.match(hero, /Run your Job hunt like an Operation/)
  assert.match(hero, /LandingDropzone/)
  assert.match(hero, /landing_dropzone_hero/)
  assert.match(hero, /landing_path_fresher/)
  assert.match(hero, /landing_path_switcher/)
  assert.match(hero, /Browse jobs instead/)
  assert.doesNotMatch(hero, /LandingCvHub|seekers/)
  assert.ok(
    hero.indexOf("<LandingStats") < hero.indexOf("lp-hero-inner"),
    "the credibility metrics should sit above the hero content",
  )

  // The four-tab loop is its own labelled section, tab 01 default.
  assert.match(hub, /role="tablist"/)
  assert.match(hub, /Four things, one loop\./)
  assert.match(hub, /01 · tailor & apply/)
  assert.match(hub, /02 · live job data/)
  assert.match(hub, /03 · pipeline tracker/)
  assert.match(hub, /04 · company intel/)
  assert.match(hub, /id="use-cases"/)
  assert.match(hub, /LandingScoreSample/)
  assert.match(hub, /LandingMatchSample/)
  assert.match(hub, /LandingLiveSample/)
  assert.match(hub, /LandingPipelineSample/)
  assert.match(hub, /LandingIntelSample/)
  assert.doesNotMatch(hub, /LandingDropzone|lp-hub-drop/)

  // The sample eyebrows are what keep illustrative panels honest — handoff §4
  // lists them verbatim and says not to drop them.
  assert.match(score, /example myro score/)
  assert.match(match, /myro job match/)
  assert.match(match, /Tailor &amp; apply/)
  // The source rail lived here and repeated the company marquee 200px below it.
  // Company provenance belongs to LandingCompanyRail, once.
  assert.doesNotMatch(match, /Live source|company career pages/)

  // The active tab is marked by an indicator element, never by colour: it has
  // to overlap the tablist hairline so the tab joins its panel (handoff §3).
  assert.match(hub, /lp-hub-tab-mark/)
  assert.match(hub, /id={`tab-\${item\.id}`}/)
  assert.match(hub, /aria-controls={`panel-\${item\.id}`}/)

  assert.match(companyRail, /Read live from/)
  assert.match(companyRail, /company career pages/)
  assert.match(companyRail, /useAllowLoopingMotion/)
  assert.match(companyRail, /\[0, 1\]\.map/)
  assert.match(motion, /lp-company-rail-run/)
  assert.match(motion, /prefers-reduced-motion: no-preference/)

  // Section order: hero → use-cases → partner rail → company rail → live-mirror → search → commons.
  assert.doesNotMatch(landing, /LandingClosing|LandingHowItWorks|LandingApplicationPlan|LandingDomains/)
  assert.ok(
    landing.indexOf("<LandingFinlaticsRail") > landing.indexOf("<LandingUseCases"),
    "the Finlatics ticker should follow the use-cases loop",
  )
  assert.ok(
    landing.indexOf("<LandingCompanyRail") > landing.indexOf("<LandingFinlaticsRail"),
    "the company rail should follow the Finlatics ticker",
  )
  assert.ok(
    landing.indexOf("<LandingUseCases") > landing.indexOf("<LandingHero"),
    "the four-tab loop should follow the hero",
  )
  assert.ok(
    landing.indexOf("<LandingCompanyRail") > landing.indexOf("<LandingUseCases"),
    "the live company rail should follow the use-cases loop",
  )
  assert.ok(
    landing.indexOf("<LandingLiveMirror") < landing.indexOf("<LandingJobSearch"),
    "the search/industry shortcut should follow the live-mirror proof",
  )
  assert.ok(
    landing.indexOf("<LandingCommons") > landing.indexOf("<LandingJobSearch"),
    "the commons strip should close the page",
  )
})

test("the landing upload keeps the canonical anonymous preview handoff", () => {
  const dropzone = read("components/public/landing/dropzone.tsx")
  const landing = read("components/public/landing-page.tsx")
  const hero = read("components/public/landing/hero.tsx")

  assert.match(dropzone, /router\.push\("\/cv-preview"\)/)
  assert.match(dropzone, /No CV\? Paste your CV text/)
  assert.match(hero, /Browse jobs instead/)
  assert.doesNotMatch(landing, /landing_dropzone_closing/)
})
