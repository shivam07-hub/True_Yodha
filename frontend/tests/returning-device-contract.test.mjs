import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const frontendRoot = process.cwd()

function read(path) {
  return readFileSync(join(frontendRoot, path), "utf8")
}

test("login remembers the last method on this device and does not offer Finlatics", () => {
  const login = read("components/auth/login-form.tsx")
  const methods = read("components/auth/shared/login-primary-methods.tsx")
  const callback = read("app/auth/callback/page.tsx")
  const magic = read("components/auth/shared/magic-link-input.tsx")
  const magicSender = read("lib/auth/send-magic-link.ts")
  const combined = `${login}\n${methods}`

  assert.match(login, /rememberAuth\("password"/)
  assert.match(callback, /rememberAuth\(/)
  // One sender, two surfaces: the typed input and the returning card both go
  // through send-magic-link, so the device is remembered whichever one fired.
  assert.match(magicSender, /rememberAuth\("magic_link"/)
  assert.match(magic, /sendMagicLink\(/)
  assert.match(methods, /Last used/)
  assert.doesNotMatch(combined, /Finlatics/)
  assert.equal(login.includes("localStorage."), false)
  assert.equal(callback.includes("localStorage."), false)
})

test("returning devices promote Sign in in the public nav", () => {
  const nav = read("components/public/top-nav.tsx")
  assert.match(nav, /isReturningDevice/)
  assert.match(nav, /publicAuthPrimary/)
  assert.match(nav, /primary === "signin" \? "tm-public-nav-signup"/)
})

test("account deletion forgets the device hint", () => {
  const panel = read("components/settings/account-deletion-panel.tsx")
  assert.match(panel, /forgetDeviceAuth/)
  assert.match(panel, /clearSessionTokens/)
})

test("device memory is local to the browser and never asks the server", () => {
  const source = read("lib/auth/last-auth.ts")
  assert.match(source, /window\.localStorage/)
  assert.doesNotMatch(source, /fetch\(/)
  assert.doesNotMatch(source, /auth\./)
})

test("a returning device is greeted by name, with a way out", () => {
  const login = read("components/auth/login-form.tsx")
  const card = read("components/auth/shared/returning-identity.tsx")
  const callback = read("app/auth/callback/page.tsx")

  assert.match(login, /<ReturningIdentity/)
  assert.match(login, /forgetDeviceAuth\(\)/)
  // The name and face only ever come from the provider, via the callback.
  assert.match(callback, /identityFromUserMetadata/)
  assert.match(card, /Not you\?/)
  assert.match(card, /Other options/)
  // The card sends a link; it must never claim to sign the person straight in.
  assert.match(card, /Email me a link/)
})
