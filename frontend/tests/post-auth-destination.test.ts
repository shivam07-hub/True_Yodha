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

test("returning user always lands on /market — `next` is ignored (no deep-link surprise)", () => {
  assert.equal(postAuthDestination({
    next: "/cv",
    firstSignup: false,
    hasPendingAnonCv: false,
  }), "/market")

  assert.equal(postAuthDestination({
    next: "/cv/tailor?jobId=abc",
    firstSignup: false,
    hasPendingAnonCv: false,
  }), "/market")
})

test("brand-new signup runs onboarding, and `next` never overrides it", () => {
  assert.equal(postAuthDestination({
    next: "/market",
    firstSignup: true,
    hasPendingAnonCv: false,
  }), "/onboarding")
})
