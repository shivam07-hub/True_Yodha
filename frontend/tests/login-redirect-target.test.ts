import test from "node:test"
import assert from "node:assert/strict"

import { loginRedirectTargetFor } from "../lib/hooks/use-auth"

test("preserves authed path as ?next= (Backlog #16)", () => {
  assert.equal(loginRedirectTargetFor("/tracker"), "/login?next=%2Ftracker")
  assert.equal(
    loginRedirectTargetFor("/tracker?stage=saved"),
    "/login?next=%2Ftracker%3Fstage%3Dsaved",
  )
})

test("skips root + auth pages to avoid redirect loop", () => {
  assert.equal(loginRedirectTargetFor("/"), "/login")
  assert.equal(loginRedirectTargetFor("/login"), "/login")
  assert.equal(loginRedirectTargetFor("/login?next=%2Ftracker"), "/login")
  assert.equal(loginRedirectTargetFor("/signup"), "/login")
})

test("rejects open-redirect shapes", () => {
  assert.equal(loginRedirectTargetFor("//evil.com"), "/login")
  assert.equal(loginRedirectTargetFor("/\\evil.com"), "/login")
  assert.equal(loginRedirectTargetFor("https://evil.com"), "/login")
})
