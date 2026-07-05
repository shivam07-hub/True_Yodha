import test from "node:test"
import assert from "node:assert/strict"

import { postAuthDestination } from "../lib/auth/post-auth-destination"

test("pending anonymous CV sends the user to CV Playground before default auth destinations", () => {
  assert.equal(postAuthDestination({
    next: null,
    firstSignup: true,
    hasPendingAnonCv: true,
  }), "/cv?upload=1")

  assert.equal(postAuthDestination({
    next: null,
    firstSignup: false,
    hasPendingAnonCv: true,
  }), "/cv?upload=1")
})
