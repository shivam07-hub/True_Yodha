import test from "node:test"
import assert from "node:assert/strict"

import {
  authCallbackFailure,
  authFlowTypeForUrl,
} from "../lib/auth/callback-flow"

test("server-minted magic links use the implicit callback flow", () => {
  assert.equal(
    authFlowTypeForUrl(
      "https://www.himyro.com/auth/callback#access_token=token&refresh_token=refresh&expires_in=3600&token_type=bearer",
    ),
    "implicit",
  )
})

test("OAuth callbacks and ordinary pages keep the PKCE flow", () => {
  assert.equal(
    authFlowTypeForUrl("https://www.himyro.com/auth/callback?code=one-time-code"),
    "pkce",
  )
  assert.equal(authFlowTypeForUrl("https://www.himyro.com/login#access_token=not-a-callback"), "pkce")
})

test("malformed URLs fail closed to PKCE", () => {
  assert.equal(authFlowTypeForUrl("not a URL"), "pkce")
})

test("expired callbacks are distinguished from other authentication failures", () => {
  assert.equal(authCallbackFailure({ code: "otp_expired", message: "expired" }), "expired")
  assert.equal(authCallbackFailure({ message: "Email link is invalid or has expired" }), "expired")
  assert.equal(authCallbackFailure({ code: "access_denied", message: "User cancelled" }), "failed")
})
