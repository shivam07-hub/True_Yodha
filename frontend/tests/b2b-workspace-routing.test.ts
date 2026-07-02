import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const frontendRoot = process.cwd()

function read(path: string): string {
  return readFileSync(join(frontendRoot, path), "utf8")
}

test("public recruiter and referral doors point to their workspace previews", () => {
  const recruiters = read("app/recruiters/page.tsx")
  const referrals = read("app/referrals/page.tsx")

  assert.match(recruiters, /secondaryCta: \{ href: "\/recruiters\/workspace", label: "Preview workspace" \}/)
  assert.match(referrals, /secondaryCta: \{ href: "\/referrals\/workspace", label: "Preview workspace" \}/)
})

test("workspace previews are backed by public routes and app routes", () => {
  const recruiterPreview = read("app/recruiters/workspace/page.tsx")
  const referralPreview = read("app/referrals/workspace/page.tsx")
  const recruiterAuthed = read("app/(authed)/recruiter/page.tsx")
  const referralAuthed = read("app/(authed)/referral/page.tsx")

  assert.match(recruiterPreview, /canonical: `\$\{BASE\}\/recruiters\/workspace`/)
  assert.match(referralPreview, /canonical: `\$\{BASE\}\/referrals\/workspace`/)
  assert.match(recruiterAuthed, /RecruiterDashboard/)
  assert.match(referralAuthed, /ReferralDashboard/)
})
