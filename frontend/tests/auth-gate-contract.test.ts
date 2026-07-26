import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const frontendRoot = process.cwd()

function read(path: string) {
  return readFileSync(join(frontendRoot, path), "utf8")
}

/**
 * 2026-07-26 regression lock.
 *
 * A real user created an account successfully — Supabase issued the session,
 * the app loaded behind the modal — and the signup modal stayed on screen with
 * body scroll locked. It read as "signup is broken", so they retried the same
 * email and got 400 "Could not create the account. Please try again."
 *
 * Two invariants come out of it:
 *   1. The gate closes when a session appears, enforced in ONE place, so no
 *      future auth path can forget to close it.
 *   2. A failure with a known recovery never renders as a bare retry.
 */

test("signup gate closes on the session event, not per-form", () => {
  const modal = read("components/auth/signup-modal.tsx")

  assert.match(modal, /subscribeToSessionChanges/)
  assert.match(modal, /if \(token\) closeGate\(\)/)
})

test("auth forms never close the gate themselves", () => {
  // The forms also mount on /signup and /login where no gate exists. Closing
  // from inside a form is how the invariant gets half-applied — one path
  // remembers, the next one added does not.
  for (const path of [
    "components/auth/signup-password-form.tsx",
    "components/auth/login-form.tsx",
    "components/auth/signup-form.tsx",
  ]) {
    assert.equal(read(path).includes("closeGate"), false, `${path} must not close the gate`)
  }
})

test("existing-email signup routes to sign-in instead of a retry", () => {
  const form = read("components/auth/signup-password-form.tsx")

  assert.match(form, /errorCode\(err\)/)
  assert.match(form, /code === "email_taken"/)
  // The address must survive the handoff — retyping it is the friction the
  // whole branch exists to remove.
  assert.match(form, /onEmailTaken\(normalizedEmail\)/)
  assert.match(form, /\/login\?email=\$\{encodeURIComponent\(normalizedEmail\)\}/)
})

test("modal keeps an existing-account user inside the modal", () => {
  const modal = read("components/auth/signup-modal.tsx")

  assert.match(modal, /onEmailTaken=\{\(email\) => setMode\("login", email\)\}/)
  assert.match(modal, /initialEmail=\{prefillEmail\}/)
})

test("login prefills a known address and opens on the password form", () => {
  const form = read("components/auth/login-form.tsx")

  assert.match(form, /useState\(initialEmail \?\? ""\)/)
  assert.match(form, /initialEmail \? "password" : "primary"/)
  assert.match(read("app/login/page.tsx"), /useSearchParams\(\)\.get\("email"\)/)
})

test("unconfirmed email is not reported as bad credentials", () => {
  const form = read("components/auth/login-form.tsx")

  assert.match(form, /code === "email_not_confirmed"/)
  // Recovery is the magic link — the password was never the problem.
  assert.match(form, /setMode\("primary"\)/)
})

test("backend failure codes survive the transport", () => {
  const apiError = read("lib/api-error.ts")
  const api = read("lib/api.ts")

  assert.match(apiError, /readonly code: string \| null/)
  assert.match(apiError, /export function readErrorCode/)
  assert.match(apiError, /export function errorCode/)
  // Both throw sites must attach it, or recovery silently stops working on
  // whichever path was missed.
  assert.equal((api.match(/code: readErrorCode\(body\)/g) ?? []).length, 2)
})
