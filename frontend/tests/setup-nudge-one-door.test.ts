import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import assert from "node:assert/strict"

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8")

/** This codebase writes long explanatory comments by house style. A contract
 *  test that greps raw source keeps matching the prose describing the old
 *  behaviour instead of the code implementing the new one. Scan code only. */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const nudge = code("components/common/setup-nudge.tsx")
const marketPage = read("app/(authed)/market/page.tsx")
const jobsTab = code("components/market/jobs-tab.tsx")

/**
 * ONE DOOR back into the spine: CV → score → target → feed.
 *
 * `/cv` is the workstation. It takes an upload, scores it, and stops — it has
 * never asked for a target role. `/onboarding` is the only surface that carries
 * a user from no-CV to the feed, and it self-resolves to /market for anyone who
 * does not need it.
 *
 * Measured 2026-09-01: 234 of 729 users hold a CV with no target. A target
 * roughly triples apply rate (26% with, 9% without). Six components said
 * "Upload CV"; five of them pointed at the door that skips the target.
 */

test("the nudge has exactly one destination, and it is the one that continues", () => {
  const hrefs = [...nudge.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
  assert.deepEqual(hrefs, ["/onboarding"])
})

test("no first-upload call-to-action points at the workstation", () => {
  // /cv scores a first upload and leaves the user without a target. Surfaces
  // that ask a user to START must not send them there.
  const firstUploadSurfaces = [
    "components/common/setup-nudge.tsx",
    "components/jobs/feed-card.tsx",
    "components/preparations/score-map-card.tsx",
  ]
  for (const file of firstUploadSurfaces) {
    const src = code(file)
    for (const [, href, label] of src.matchAll(/href="(\/cv[^"]*)"[^>]*>\s*([^<]{0,40})/g)) {
      assert.doesNotMatch(
        label,
        /upload/i,
        `${file} sends a first upload to ${href} — that route never asks for a target`,
      )
    }
  }
})

test("RequiresCV moves only the missing case; retry stays where the job lives", () => {
  const src = read("components/empty/RequiresCV.tsx")
  // `processing` and `failed` mean a job EXISTS. /cv owns its status and retry.
  assert.match(src, /ctaLabel: "Check CV status",\s*\n\s*ctaHref: "\/cv"/)
  assert.match(src, /ctaLabel: "Retry CV upload",\s*\n\s*ctaHref: "\/cv\?upload=1"/)
  // `missing` means no job at all — that is the start of the spine.
  assert.match(src, /ctaLabel: "Upload CV to unlock Skills",[\s\S]{0,400}?ctaHref: "\/onboarding"/)
  assert.match(src, /ctaLabel: "Upload your CV",\s*\n\s*ctaHref: "\/onboarding"/)
})

test("both viewports of /market render the same nudge", () => {
  // Mobile used to render a different component with different copy pointing at
  // a different door, and rendered nothing at all for a user who had a CV but no
  // target — hiding the 234-user cohort on the viewport most of them use.
  assert.match(marketPage, /import \{ SetupNudge \}/)
  assert.match(marketPage, /<SetupNudge/)
  assert.match(jobsTab, /import \{ SetupNudge \}/)
  assert.match(jobsTab, /<SetupNudge/)
})

test("it is gated on what is missing, never on the completion flag", () => {
  // 111 users carry `onboarding_complete = true` with no target role. A flag is
  // not the fact — the same lesson as the NULL scoping key that told 162 users
  // the market was empty.
  assert.match(nudge, /if \(hasCv && hasTargetRoles\) return null/)
  assert.doesNotMatch(nudge, /onboardingComplete|onboarding_complete/)
  // And the dead prop is gone from the surface that used to read it.
  assert.doesNotMatch(jobsTab, /onboardingComplete/)
})

test("it never nudges on a guess", () => {
  // The profile fetch resolves ~300ms after paint. Nudging before it lands
  // flashes "Upload your CV" at someone who has one.
  assert.match(nudge, /if \(!resolved\) return null/)
  assert.match(marketPage, /resolved=\{profileData !== undefined\}/)
  assert.match(jobsTab, /resolved=\{cvResolved\}/)
})

test("the button colour reads a token that exists", () => {
  // `--tm-on-interactive` was never defined anywhere, so the rule silently took
  // its hardcoded #fff fallback on both surfaces.
  const css = code("components/common/setup-nudge.css")
  const tokens = read("app/design-tokens.css")
  for (const [, name] of css.matchAll(/var\((--tm-[a-z0-9-]+)/g)) {
    assert.ok(tokens.includes(`${name}:`), `${name} is used but never defined`)
  }
})
