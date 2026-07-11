import test from "node:test"
import assert from "node:assert/strict"

import { postAuthDestination } from "../lib/auth/post-auth-destination"

const base = { next: null, firstSignup: false, hasPendingAnonCv: false, hasPendingJobSave: false }

test("pending anonymous CV sends the user to CV Playground before default auth destinations", () => {
  assert.equal(postAuthDestination({ ...base, firstSignup: true, hasPendingAnonCv: true }), "/cv?upload=1")
  assert.equal(postAuthDestination({ ...base, hasPendingAnonCv: true }), "/cv?upload=1")
})

test("pending job save (Exception 2) lands on Collections, overriding onboarding", () => {
  assert.equal(postAuthDestination({ ...base, hasPendingJobSave: true }), "/collections")
  assert.equal(postAuthDestination({ ...base, firstSignup: true, hasPendingJobSave: true }), "/collections")
})

test("anon CV wins over a pending job save when both are set", () => {
  assert.equal(
    postAuthDestination({ ...base, hasPendingAnonCv: true, hasPendingJobSave: true }),
    "/cv?upload=1",
  )
})

test("returning user always lands on /market — `next` is ignored (no deep-link surprise)", () => {
  assert.equal(postAuthDestination({ ...base, next: "/cv" }), "/market")
  assert.equal(postAuthDestination({ ...base, next: "/cv/tailor?jobId=abc" }), "/market")
})

test("brand-new signup runs onboarding, and `next` never overrides it", () => {
  assert.equal(postAuthDestination({ ...base, next: "/market", firstSignup: true }), "/onboarding")
})
