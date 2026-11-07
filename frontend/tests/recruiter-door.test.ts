import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const frontendRoot = process.cwd()

function read(path: string): string {
  return readFileSync(join(frontendRoot, path), "utf8")
}

function exists(path: string): boolean {
  return existsSync(join(frontendRoot, path))
}

test("the recruiter door is the post form, then her home — not a pitch", () => {
  const page = read("app/recruiters/page.tsx")
  const door = read("components/internships/recruiter-door.tsx")
  assert.match(page, /RecruiterDoor/)
  assert.match(door, /InternshipPostForm/)
  assert.match(door, /RecruiterHome/)
  for (const text of [page, door]) {
    assert.doesNotMatch(text, /mailto:/, "the door never asks her to email the founder")
    assert.doesNotMatch(text, /boardRows|shortlist preview/i, "no sample candidates on the door")
  }
})

test("recruiter pages never mount the seeker strip", () => {
  for (const file of ["app/recruiters/page.tsx", "app/recruiters/[jobId]/applicants/[applicationId]/page.tsx"]) {
    const text = read(file)
    assert.match(text, /RecruiterTopBar/, file)
    assert.doesNotMatch(text, /PublicTopNav|AuthedTopStrip/, file)
  }
})

test("the post form never sends a logged-out recruiter away before she writes", () => {
  // useAuth redirects a logged-out visitor to /login on mount; she writes the
  // post first and signs in at Post (lib/internship-post-stash).
  assert.doesNotMatch(read("components/internships/post-form.tsx"), /useAuth\(/)
})

test("the mock B2B previews stay parked until a real user exists", () => {
  // /referrals, /referrals/workspace and /recruiters/workspace showed invented
  // candidates with match scores and no product behind them. Parked 2026-11-07
  // (ARCHIVE). Their URLs forward in next.config.mjs, so old links still land.
  for (const parked of [
    "app/referrals/page.tsx",
    "app/referrals/workspace/page.tsx",
    "app/recruiters/workspace/page.tsx",
    "app/(authed)/recruiter/page.tsx",
    "app/(authed)/referral/page.tsx",
    "components/b2b",
  ]) {
    assert.equal(exists(parked), false, `${parked} is back without a real user — wire it or leave it parked`)
  }
  const config = read("next.config.mjs")
  for (const source of ["/internships/post", "/recruiters/workspace", "/referrals/:path*"]) {
    assert.ok(config.includes(`source: "${source}"`), `${source} must keep forwarding`)
  }
})

test("seeker surfaces never ask a seeker to post an internship", () => {
  for (const seekerFile of [
    "components/market/market-jobs-column.tsx",
    "components/internships/internships-surface.tsx",
    "components/internships/apply-form.tsx",
  ]) {
    assert.doesNotMatch(read(seekerFile), /Post a paid internship|href="\/recruiters"/, seekerFile)
  }
})
