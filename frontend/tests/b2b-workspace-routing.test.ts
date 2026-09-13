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

test("public recruiter and referral doors point to their workspace previews", () => {
  const recruiters = read("app/recruiters/page.tsx")
  const referrals = read("app/referrals/page.tsx")

  assert.match(recruiters, /secondaryCta: \{ href: "\/recruiters\/workspace", label: "Preview workspace" \}/)
  assert.match(referrals, /secondaryCta: \{ href: "\/referrals\/workspace", label: "Preview workspace" \}/)
})

test("workspace previews are self-canonical and render the B2B dashboards", () => {
  const recruiterPreview = read("app/recruiters/workspace/page.tsx")
  const referralPreview = read("app/referrals/workspace/page.tsx")

  assert.match(recruiterPreview, /canonical: `\$\{BASE\}\/recruiters\/workspace`/)
  assert.match(referralPreview, /canonical: `\$\{BASE\}\/referrals\/workspace`/)
  assert.match(recruiterPreview, /RecruiterDashboard/)
  assert.match(referralPreview, /ReferralDashboard/)
})

test("the B2B dashboards have exactly one home each", () => {
  // `5eeff807` (2026-07-03) added authed /recruiter and /referral routes as
  // "auth-ready" — five-line copies of these same two components, with no
  // account type to sign in as and no link from anywhere. Ten weeks later
  // nothing had been built on them, and the reach gate found them the way it
  // found /notebook. Deleted 2026-09-13; when the B2B lane is real
  // (project_b2b_institutions_lane) the authed route is five lines again.
  //
  // This test exists so they cannot come back ahead of a door.
  for (const dead of ["app/(authed)/recruiter/page.tsx", "app/(authed)/referral/page.tsx"]) {
    assert.equal(exists(dead), false, `${dead} is back without a door — wire it or leave it deleted`)
  }
})
