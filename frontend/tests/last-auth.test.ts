import test from "node:test"
import assert from "node:assert/strict"

import {
  forgetDeviceAuth,
  highlightableLastMethod,
  isReturningDevice,
  loginStackOrder,
  methodFromCallback,
  publicAuthPrimary,
  readLastAuthMethod,
  readLastEmail,
  rememberAuth,
} from "../lib/auth/last-auth"

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

test("remembered method and email round-trip on this device", () => {
  const storage = new MemoryStorage()
  rememberAuth("linkedin", "Asha@Email.com", storage)

  assert.equal(readLastAuthMethod(storage), "linkedin")
  assert.equal(readLastEmail(storage), "asha@email.com")
  assert.equal(isReturningDevice(storage), true)
})

test("unknown or corrupt records are ignored", () => {
  const storage = new MemoryStorage()
  storage.setItem("myro_last_auth_v1", "{not json")
  assert.equal(readLastAuthMethod(storage), null)
  assert.equal(isReturningDevice(storage), false)

  rememberAuth("sms" as never, "not-an-email", storage)
  assert.equal(readLastAuthMethod(storage), null)
  assert.equal(readLastEmail(storage), null)
})

test("partner SSO is a returning device but is not a public login button", () => {
  const storage = new MemoryStorage()
  rememberAuth("partner", "asha@email.com", storage)

  assert.equal(isReturningDevice(storage), true)
  assert.equal(highlightableLastMethod("partner", { inAppBrowser: false }), null)
  assert.equal(readLastAuthMethod(storage), "partner")
})

test("Google in an in-app browser highlights the magic link instead", () => {
  assert.equal(
    highlightableLastMethod("google", { inAppBrowser: true }),
    "magic_link",
  )
  assert.equal(
    highlightableLastMethod("linkedin", { inAppBrowser: true }),
    "linkedin",
  )
})

test("the last method leads the login stack; others stay visible", () => {
  assert.deepEqual(loginStackOrder("linkedin"), ["linkedin", "google", "magic_link"])
  assert.deepEqual(loginStackOrder("magic_link"), ["magic_link", "google", "linkedin"])
  assert.deepEqual(loginStackOrder("password"), ["google", "linkedin", "magic_link"])
  assert.deepEqual(loginStackOrder(null), ["google", "linkedin", "magic_link"])
})

test("callback providers map to a stored method without asking the server", () => {
  assert.equal(methodFromCallback({ provider: "google" }), "google")
  assert.equal(methodFromCallback({ provider: "linkedin_oidc" }), "linkedin")
  assert.equal(methodFromCallback({ provider: "email" }), "magic_link")
  assert.equal(methodFromCallback({ provider: "email", via: "finlatics" }), "partner")
})

test("a returning device makes Sign in the public primary", () => {
  assert.equal(publicAuthPrimary(false), "signup")
  assert.equal(publicAuthPrimary(true), "signin")
})

test("forgetting the device hint does not require a session", () => {
  const storage = new MemoryStorage()
  rememberAuth("google", "asha@email.com", storage)
  forgetDeviceAuth(storage)
  assert.equal(isReturningDevice(storage), false)
  assert.equal(readLastEmail(storage), null)
})
