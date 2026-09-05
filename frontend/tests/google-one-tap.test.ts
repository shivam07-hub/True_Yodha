import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  createOneTapNonce,
  googleClientId,
  googleOneTapEnabled,
  GSI_CLIENT_SRC,
} from "../lib/auth/google-one-tap"
import { buildContentSecurityPolicy } from "../lib/security-policy"

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8")
}

test("Google gets the hash of the nonce, Supabase gets the original", async () => {
  const nonce = await createOneTapNonce()

  assert.notEqual(nonce.raw, nonce.hashed)
  assert.match(nonce.hashed, /^[0-9a-f]{64}$/)
  assert.equal(
    nonce.hashed,
    createHash("sha256").update(nonce.raw).digest("hex"),
  )
})

test("every prompt gets its own nonce", async () => {
  const [first, second] = await Promise.all([createOneTapNonce(), createOneTapNonce()])
  assert.notEqual(first.raw, second.raw)
})

test("One Tap is off until a client ID exists", () => {
  const original = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  try {
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    assert.equal(googleClientId(), null)
    assert.equal(googleOneTapEnabled(), false)

    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "   "
    assert.equal(googleOneTapEnabled(), false)

    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = " 123.apps.googleusercontent.com "
    assert.equal(googleClientId(), "123.apps.googleusercontent.com")
    assert.equal(googleOneTapEnabled(), true)
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    else process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = original
  }
})

test("the policy stays exactly as tight as before while One Tap is unconfigured", () => {
  const policy = buildContentSecurityPolicy({
    nonce: "nonce-value",
    apiUrl: "https://api.himyro.com",
    supabaseUrl: "https://project.supabase.co",
    production: true,
  })

  assert.doesNotMatch(policy, /accounts\.google\.com/)
})

test("a configured One Tap widens exactly four directives", () => {
  const policy = buildContentSecurityPolicy({
    nonce: "nonce-value",
    apiUrl: "https://api.himyro.com",
    supabaseUrl: "https://project.supabase.co",
    production: true,
    googleOneTap: true,
  })

  assert.match(policy, /script-src[^;]*https:\/\/accounts\.google\.com\/gsi\/client/)
  assert.match(policy, /style-src[^;]*https:\/\/accounts\.google\.com\/gsi\/style/)
  assert.match(policy, /connect-src[^;]*https:\/\/accounts\.google\.com\/gsi\//)
  assert.match(policy, /frame-src[^;]*https:\/\/accounts\.google\.com\/gsi\//)
  // The widening is scoped to GSI paths, never the whole Google origin.
  assert.doesNotMatch(policy, /https:\/\/accounts\.google\.com(?![/])/)
})

test("the prompt is mounted on every auth surface and gated on the client ID", () => {
  const component = read("components/auth/google-one-tap.tsx")
  const login = read("app/login/page.tsx")
  const signup = read("app/signup/signup-route.tsx")
  const modal = read("components/auth/signup-modal.tsx")
  const middleware = read("middleware.ts")

  assert.match(login, /<GoogleOneTap/)
  assert.match(signup, /<GoogleOneTap/)
  // The modal is the third auth surface — most visitors never reach /login.
  assert.match(modal, /<GoogleOneTap surface=\{isLogin \? "login_modal" : "signup_modal"\}/)
  assert.match(component, /if \(!clientId \|\| !eligible\) return null/)
  assert.match(component, /src=\{GSI_CLIENT_SRC\}/)
  assert.equal(GSI_CLIENT_SRC, "https://accounts.google.com/gsi/client")
  // The CSP widens from the same switch that mounts the script.
  assert.match(middleware, /googleOneTap: Boolean/)
})

test("a One Tap credential finishes at the one callback, not a second copy of it", () => {
  const component = read("components/auth/google-one-tap.tsx")

  assert.match(component, /signInWithIdToken/)
  assert.match(component, /router\.replace\(`\/auth\/callback\?\$\{AUTH_METHOD_PARAM\}=google`\)/)
  // `via` on that route means partner SSO — a One Tap hand-off must never
  // carry it, or the device would remember a Finlatics seat.
  assert.doesNotMatch(component, /via=/)
  // Signed-in visitors and in-app webviews never see the prompt.
  assert.match(component, /getAccessToken\(\)/)
  assert.match(component, /detectInAppBrowser\(\)/)
})
