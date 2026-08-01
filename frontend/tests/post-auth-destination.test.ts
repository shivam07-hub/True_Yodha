import test from "node:test"
import assert from "node:assert/strict"

import { postAuthDestination } from "../lib/auth/post-auth-destination"

const base = {
  firstSignup: false,
  hasPendingAnonCv: false,
  hasPendingJobSave: false,
  pendingExtensionConnect: null,
}

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

const EXT = "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/"

test("a blocked extension handshake outranks every other intent", () => {
  // It is the only intent the user cannot resume by navigating: the redirect_uri
  // came from launchWebAuthFlow and is gone once this tab moves on.
  const dest = postAuthDestination({ ...base, pendingExtensionConnect: EXT })
  assert.equal(dest, `/extension/connect?redirect_uri=${encodeURIComponent(EXT)}`)
  assert.equal(
    postAuthDestination({
      ...base,
      pendingExtensionConnect: EXT,
      hasPendingAnonCv: true,
      hasPendingJobSave: true,
      firstSignup: true,
    }),
    `/extension/connect?redirect_uri=${encodeURIComponent(EXT)}`,
  )
})

test("the handshake target is encoded, never concatenated raw", () => {
  const dest = postAuthDestination({ ...base, pendingExtensionConnect: EXT })
  // One query param — a raw `https://…/` would smuggle its own `/` and `:`.
  assert.equal(dest.split("?").length, 2)
  assert.equal(new URLSearchParams(dest.split("?")[1]).get("redirect_uri"), EXT)
})

test("returning user always lands on /market (no deep-link return)", () => {
  assert.equal(postAuthDestination({ ...base }), "/market")
})

test("brand-new signup runs onboarding", () => {
  assert.equal(postAuthDestination({ ...base, firstSignup: true }), "/onboarding")
})

test("the destination is decided by carried intent alone", () => {
  // Guard against re-growing a caller-supplied route. `next` was threaded through
  // the gate store, the modal and both auth forms while this function ignored it,
  // which taught every reader that deep-link return worked (deleted 2026-07-31).
  // Any new input here must be READ below, not merely accepted.
  const accepted = Object.keys(base).sort()
  assert.deepEqual(accepted, [
    "firstSignup",
    "hasPendingAnonCv",
    "hasPendingJobSave",
    "pendingExtensionConnect",
  ])
  const src = postAuthDestination.toString()
  for (const key of accepted) assert.ok(src.includes(key), `${key} is accepted but never read`)
})
