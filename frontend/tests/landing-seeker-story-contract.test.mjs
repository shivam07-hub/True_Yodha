import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const frontendRoot = process.cwd()

function read(path) {
  return readFileSync(join(frontendRoot, path), "utf8")
}

test("the public landing tells one story, hero to close", () => {
  const landing = read("components/public/landing-page.tsx")
  const hero = read("components/public/landing/hero.tsx")
  const companyRail = read("components/public/landing/company-rail.tsx")
  const motion = read("components/public/landing/landing-motion.css")

  // Hero (spec #66 chapter 1): what MNCs hire for, the job you want and your
  // level, then the dropzone carrying that pick.
  assert.match(hero, /See what MNCs hire for\./)
  assert.match(hero, /before they do\./)
  assert.match(hero, /<RolePicker/)
  assert.match(hero, /LandingDropzone/)
  assert.match(hero, /landing_dropzone_hero/)
  assert.match(hero, /destination=\{uploadDestination\(pick\)\}/)
  assert.match(hero, /Browse jobs instead/)
  assert.doesNotMatch(hero, /LandingCvHub|seekers|LandingStats/)
  // Chapters 2–3 read the hero's pick, so the landing page owns it.
  assert.match(landing, /<LandingHero pick=\{pick\} onPick=\{setPick\} \/>/)
  assert.match(hero, /data-bridge-step/)

  assert.match(companyRail, /Read live from/)
  assert.match(companyRail, /company career pages/)
  assert.match(companyRail, /useAllowLoopingMotion/)
  assert.match(companyRail, /\[0, 1\]\.map/)
  assert.match(motion, /lp-company-rail-run/)
  assert.match(motion, /prefers-reduced-motion: no-preference/)

  // Section order (spec #66 L6): hero → open jobs (holds the company rail) →
  // skills → the gap → fill the gap (holds the partner rail) → the reviewer →
  // the close. The old sections left: search and the industry explorer live
  // on /intel, colleges and the newsletter in the footer.
  assert.doesNotMatch(
    landing,
    /LandingUseCases|LandingLiveMirror|LandingJobSearch|LandingCommons|LandingClosing|LandingHowItWorks|LandingApplicationPlan|LandingDomains/,
  )
  const openJobs = read("components/public/landing/open-jobs.tsx")
  assert.match(openJobs, /<LandingCompanyRail/)
  assert.doesNotMatch(landing, /<LandingCompanyRail/, "the company rail renders once, inside chapter 2")
  assert.ok(
    landing.indexOf("<LandingOpenJobs") > landing.indexOf("<LandingHero"),
    "open jobs should follow the hero",
  )
  assert.ok(
    landing.indexOf("<LandingRoleSkills") > landing.indexOf("<LandingOpenJobs"),
    "skills should follow open jobs",
  )
  assert.ok(
    landing.indexOf("<LandingGapExample") > landing.indexOf("<LandingRoleSkills"),
    "the gap example should follow the skills",
  )
  assert.ok(
    landing.indexOf("<LandingFillGap") > landing.indexOf("<LandingGapExample"),
    "filling the gap should follow the gap",
  )
  const fillGap = read("components/public/landing/fill-gap.tsx")
  assert.match(fillGap, /<LandingFinlaticsRail/)
  assert.doesNotMatch(landing, /<LandingFinlaticsRail/, "the Finlatics ticker renders once, inside chapter 5")
  assert.ok(
    landing.indexOf("<LandingReviewer") > landing.indexOf("<LandingFillGap"),
    "the reviewer should follow filling the gap",
  )
  assert.ok(
    landing.indexOf("<LandingClose") > landing.indexOf("<LandingReviewer"),
    "the close should follow the reviewer",
  )
  assert.ok(
    landing.indexOf("</main>") > landing.indexOf("<LandingClose") &&
      landing.indexOf("<LandingClose") === landing.lastIndexOf("<Landing"),
    "the close should be the last chapter",
  )
  const close = read("components/public/landing/close.tsx")
  assert.match(close, /See your gap\. Free, no sign-up\./)
  assert.match(close, /data-bridge-step/)
})

test("the landing upload keeps the canonical anonymous preview handoff", () => {
  const dropzone = read("components/public/landing/dropzone.tsx")
  const landing = read("components/public/landing-page.tsx")
  const hero = read("components/public/landing/hero.tsx")

  const picker = read("components/public/landing/role-picker.tsx")
  const gap = read("components/public/landing/gap-example.tsx")
  const uploadButton = read("components/public/landing/upload-button.tsx")

  // Every upload still lands on the anonymous scorer; the pick only adds the
  // role and level as query params (spec #66 L2). The mid-page upload button
  // hands off through the dropzone's own hook, never a route of its own.
  assert.match(dropzone, /destination = "\/cv-preview"/)
  assert.match(dropzone, /router\.push\(destination\)/)
  assert.match(picker, /`\/cv-preview\?\$\{params\.toString\(\)\}`/)
  assert.match(hero, /destination=\{uploadDestination\(pick\)\}/)
  assert.match(gap, /destination=\{uploadDestination\(pick\)\}/)
  const reviewer = read("components/public/landing/reviewer.tsx")
  assert.match(reviewer, /destination=\{uploadDestination\(pick\)\}/)
  assert.match(uploadButton, /useCvHandoff\(destination\)/)
  assert.doesNotMatch(uploadButton, /router|href=/)
  assert.match(dropzone, /No CV\? Paste your CV text/)
  assert.match(hero, /Browse jobs instead/)
  const close = read("components/public/landing/close.tsx")
  assert.match(close, /<LandingDropzone variant="stage" source="landing_dropzone_close" destination=\{uploadDestination\(pick\)\}/)
  assert.match(landing, /<LandingClose pick=\{pick\} \/>/)
})


test("the reviewer chapter reads the live slots and states only the agreed credentials", () => {
  const reviewer = read("components/public/landing/reviewer.tsx")

  // Dots and the open count come from the public read, never a literal (spec
  // #66 Q15–Q16): "full" only when every slot holds a check.
  assert.match(reviewer, /humanCheckSlots\.get\(\)/)
  assert.match(reviewer, /slots\.slots_open === 0/)
  assert.match(reviewer, /\{slots \? <SlotsLine/)
  assert.doesNotMatch(reviewer, /Capgemini/)
  for (const credential of ["IIM Lucknow", "MIT Manipal", "CAT 99.65", "XAT 98.05", "nearly 5,000 CVs"]) {
    assert.ok(reviewer.includes(credential), `missing agreed credential: ${credential}`)
  }
})
