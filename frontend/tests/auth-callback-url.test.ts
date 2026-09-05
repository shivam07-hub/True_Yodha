import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { authCallbackUrl, AUTH_METHOD_PARAM } from "../lib/auth/callback-url"

test("each method states itself on the callback URL", () => {
  const google = new URL(authCallbackUrl("google", "https://himyro.com"))
  assert.equal(google.pathname, "/auth/callback")
  assert.equal(google.searchParams.get(AUTH_METHOD_PARAM), "google")

  const magic = new URL(authCallbackUrl("magic_link", "https://himyro.com"))
  assert.equal(magic.searchParams.get(AUTH_METHOD_PARAM), "magic_link")

  // `via` is partner SSO on that route — a first-party start must never mint it.
  assert.equal(google.searchParams.get("via"), null)
  assert.equal(magic.searchParams.get("via"), null)
})

test("every first-party sign-in start names its own method", () => {
  const login = readFileSync(join(process.cwd(), "components/auth/login-form.tsx"), "utf8")
  const signup = readFileSync(join(process.cwd(), "components/auth/signup-form.tsx"), "utf8")

  for (const source of [login, signup]) {
    assert.match(source, /authCallbackUrl\("magic_link", origin\)/)
    assert.match(source, /authCallbackUrl\(provider === "google" \? "google" : "linkedin", origin\)/)
    // The old single URL served every button and told the callback nothing.
    assert.doesNotMatch(source, /appendAttributionToUrl\(`\$\{window\.location\.origin\}\/auth\/callback`\)/)
  }
})
