import test from "node:test"
import assert from "node:assert/strict"

import {
  forgetDeviceAuth,
  greetableIdentity,
  identityFromUserMetadata,
  identityInitial,
  highlightableLastMethod,
  isReturningDevice,
  loginStackOrder,
  methodFromCallback,
  publicAuthPrimary,
  readLastAuthMethod,
  readLastEmail,
  readLastIdentity,
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
  rememberAuth("linkedin", "Asha@Email.com", { storage })

  assert.equal(readLastAuthMethod(storage), "linkedin")
  assert.equal(readLastEmail(storage), "asha@email.com")
  assert.equal(isReturningDevice(storage), true)
})

test("unknown or corrupt records are ignored", () => {
  const storage = new MemoryStorage()
  storage.setItem("myro_last_auth_v1", "{not json")
  assert.equal(readLastAuthMethod(storage), null)
  assert.equal(isReturningDevice(storage), false)

  rememberAuth("sms" as never, "not-an-email", { storage })
  assert.equal(readLastAuthMethod(storage), null)
  assert.equal(readLastEmail(storage), null)
})

test("partner SSO is a returning device but is not a public login button", () => {
  const storage = new MemoryStorage()
  rememberAuth("partner", "asha@email.com", { storage })

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
  rememberAuth("google", "asha@email.com", { storage })
  forgetDeviceAuth(storage)
  assert.equal(isReturningDevice(storage), false)
  assert.equal(readLastEmail(storage), null)
})

test("the device remembers a person, not only a method", () => {
  const storage = new MemoryStorage()
  rememberAuth("google", "asha@email.com", {
    name: "  Asha   Rao ",
    avatar: "https://cdn.example.com/asha.png",
    storage,
  })

  const record = readLastIdentity(storage)
  assert.equal(record?.name, "Asha Rao")
  assert.equal(record?.avatar, "https://cdn.example.com/asha.png")
  assert.equal(record?.email, "asha@email.com")
})

test("a password sign-in keeps the face the OAuth path already learned", () => {
  const storage = new MemoryStorage()
  rememberAuth("google", "asha@email.com", {
    name: "Asha Rao",
    avatar: "https://cdn.example.com/asha.png",
    storage,
  })
  rememberAuth("password", "asha@email.com", { storage })

  const record = readLastIdentity(storage)
  assert.equal(record?.method, "password")
  assert.equal(record?.name, "Asha Rao")
  assert.equal(record?.avatar, "https://cdn.example.com/asha.png")
})

test("a different address never inherits the last person's name or face", () => {
  const storage = new MemoryStorage()
  rememberAuth("google", "asha@email.com", {
    name: "Asha Rao",
    avatar: "https://cdn.example.com/asha.png",
    storage,
  })
  rememberAuth("password", "vikram@email.com", { storage })

  const record = readLastIdentity(storage)
  assert.equal(record?.email, "vikram@email.com")
  assert.equal(record?.name, null)
  assert.equal(record?.avatar, null)
})

test("only an https avatar reaches an img src", () => {
  const storage = new MemoryStorage()
  for (const avatar of ["javascript:alert(1)", "http://cdn.example.com/a.png", "data:image/png;base64,AAA", "not a url"]) {
    rememberAuth("google", "asha@email.com", { avatar, storage })
    assert.equal(readLastIdentity(storage)?.avatar, null, avatar)
  }
})

test("a record written before identity was stored still reads", () => {
  const storage = new MemoryStorage()
  storage.setItem("myro_last_auth_v1", JSON.stringify({ method: "google", email: "asha@email.com" }))

  const record = readLastIdentity(storage)
  assert.equal(record?.method, "google")
  assert.equal(record?.name, null)
  assert.equal(greetableIdentity(record)?.email, "asha@email.com")
})

test("a greeting needs both an address and a button to press", () => {
  assert.equal(greetableIdentity(null), null)
  assert.equal(
    greetableIdentity({ method: "partner", email: "asha@email.com", name: null, avatar: null }),
    null,
  )
  assert.equal(
    greetableIdentity({ method: "google", email: null, name: "Asha", avatar: null }),
    null,
  )
  assert.equal(
    greetableIdentity(
      { method: "google", email: "asha@email.com", name: null, avatar: null },
      { inAppBrowser: true },
    )?.method,
    "magic_link",
  )
})

test("the initial falls back from name to address, never to nothing", () => {
  assert.equal(identityInitial("asha rao", "x@email.com"), "A")
  assert.equal(identityInitial(null, "vikram@email.com"), "V")
  assert.equal(identityInitial("", ""), "?")
})

test("provider metadata yields a person without inventing one", () => {
  assert.deepEqual(
    identityFromUserMetadata({ full_name: "Asha Rao", picture: "https://cdn.example.com/a.png" }),
    { name: "Asha Rao", avatar: "https://cdn.example.com/a.png" },
  )
  assert.deepEqual(
    identityFromUserMetadata({ name: "Vikram", avatar_url: "https://cdn.example.com/v.png" }),
    { name: "Vikram", avatar: "https://cdn.example.com/v.png" },
  )
  assert.deepEqual(identityFromUserMetadata(undefined), { name: null, avatar: null })
  assert.deepEqual(identityFromUserMetadata({ full_name: "   " }), { name: null, avatar: null })
})

test("the caller's marker outranks a session that cannot answer the question", () => {
  // Observed 2026-09-05 on a real account with both identities: a Google One
  // Tap sign-in arrived with app_metadata.provider "email", because that field
  // holds the FIRST provider the account ever used. Without the marker the
  // device remembered "magic_link" after a Google sign-in.
  assert.equal(
    methodFromCallback({ provider: "email", marker: "google" }),
    "google",
  )
  assert.equal(
    methodFromCallback({ provider: "google", marker: "magic_link" }),
    "magic_link",
  )
  // Partner SSO still wins over everything.
  assert.equal(
    methodFromCallback({ provider: "email", marker: "google", via: "finlatics" }),
    "partner",
  )
  // A marker nobody minted is ignored, not trusted.
  assert.equal(methodFromCallback({ provider: "google", marker: "sms" }), "google")
  assert.equal(methodFromCallback({ provider: "google", marker: "partner" }), "google")
  assert.equal(methodFromCallback({ provider: "email", marker: null }), "magic_link")
})
