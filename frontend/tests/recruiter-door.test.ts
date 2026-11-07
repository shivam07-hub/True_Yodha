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

test("the recruiter door is the post form, not a pitch", () => {
  const door = read("app/recruiters/page.tsx")
  assert.match(door, /InternshipPostForm/)
  assert.doesNotMatch(door, /mailto:/, "the door never asks her to email the founder")
  assert.doesNotMatch(door, /boardRows|shortlist preview/i, "no sample candidates on the door")
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
