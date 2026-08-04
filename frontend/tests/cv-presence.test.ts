import test from "node:test"
import assert from "node:assert/strict"

import { cvPresenceFromProfile } from "../lib/cv-presence"

test("a pending profile remains unknown instead of looking like no CV", () => {
  assert.equal(cvPresenceFromProfile(undefined), "unknown")
})

test("a resolved profile distinguishes a CV owner from a no-CV candidate", () => {
  assert.equal(cvPresenceFromProfile({ has_cv: true }), "present")
  assert.equal(cvPresenceFromProfile({ has_cv: false }), "absent")
})
