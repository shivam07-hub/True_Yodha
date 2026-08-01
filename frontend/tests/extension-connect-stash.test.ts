import test from "node:test"
import assert from "node:assert/strict"

/**
 * The extension-connect stash carries a redirect_uri across auth. That URI is
 * later handed a live Supabase session in its fragment, so the validation here
 * is a security boundary, not a formatting nicety: anything that survives this
 * stash is a URL we will send a token to.
 */

import {
  EXTENSION_REDIRECT_RE,
  stashPendingExtensionConnect,
  readPendingExtensionConnect,
  clearPendingExtensionConnect,
} from "../lib/extension-connect-stash"

// Minimal sessionStorage. Safe to install after the import: the module touches
// storage only inside its functions, never at module scope.
const store = new Map<string, string>()
;(globalThis as { sessionStorage?: unknown }).sessionStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
}

const VALID = "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/"

test("a genuine chrome-extension redirect round-trips", () => {
  clearPendingExtensionConnect()
  stashPendingExtensionConnect(VALID)
  assert.equal(readPendingExtensionConnect(), VALID)
  clearPendingExtensionConnect()
  assert.equal(readPendingExtensionConnect(), null)
})

test("a hostile redirect_uri never enters the stash", () => {
  for (const hostile of [
    "https://evil.example/",
    "http://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/", // not https
    "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org.evil.com/",
    "https://evil.com/#https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/",
    "https://abcdefghijklmnopabcdefghijklmnoq.chromiumapp.org/", // 'q' is outside a–p
    "https://short.chromiumapp.org/",
    "/relative",
    "",
  ]) {
    clearPendingExtensionConnect()
    stashPendingExtensionConnect(hostile)
    // Assert the RAW store, not just the read: checking readPendingExtensionConnect
    // alone passes even with the write guard deleted, because the read guard
    // catches it. Both are load-bearing and each must be pinned by its own
    // assertion (found by reverting each guard in turn, 2026-08-01).
    assert.equal(store.get("myro_pending_ext_connect_v1"), undefined, `stored: ${hostile}`)
    assert.equal(readPendingExtensionConnect(), null, hostile)
  }
})

test("a value planted directly in sessionStorage is still rejected on read", () => {
  // The write guard is not the only gate — someone with devtools, or a stale key
  // from an older build, must not be able to route a token anywhere.
  store.set("myro_pending_ext_connect_v1", "https://evil.example/")
  assert.equal(readPendingExtensionConnect(), null)
  clearPendingExtensionConnect()
})

test("the regex is exported so the connect page cannot drift from the stash", () => {
  assert.ok(EXTENSION_REDIRECT_RE.test(VALID))
  assert.ok(!EXTENSION_REDIRECT_RE.test("https://evil.example/"))
})
