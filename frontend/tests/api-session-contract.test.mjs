import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendRoot = join(__dirname, "..")

function read(relativePath) {
  return readFileSync(join(frontendRoot, relativePath), "utf8")
}

test("api client uses session adapter and not direct localStorage access", () => {
  const source = read("lib/api.ts")
  assert.match(source, /from "\.\/session"/)
  assert.equal(source.includes("localStorage."), false)
})

test("api client only logs out for session unauthorized responses", () => {
  const source = read("lib/api.ts")
  assert.match(source, /function isSessionUnauthorized/)
  assert.match(source, /if \(isSessionUnauthorized\(body\)\) forceLogout\(\)/)
  assert.equal(source.includes("Razorpay authentication failed"), false)
})

test("use-auth hook relies on session adapter", () => {
  const source = read("lib/hooks/use-auth.ts")
  assert.match(source, /from "@\/lib\/session"/)
  assert.equal(source.includes("localStorage."), false)
})

test("auth entry points write tokens through session adapter", () => {
  const loginForm = read("components/auth/login-form.tsx")
  const callbackPage = read("app/auth/callback/page.tsx")

  assert.match(loginForm, /setSessionTokens/)
  assert.match(callbackPage, /setSessionTokens/)
  assert.equal(loginForm.includes("localStorage."), false)
  assert.equal(callbackPage.includes("localStorage."), false)
})

test("core onboarding and recommendation surfaces share canonical data keys", () => {
  const onboardingHook = read("lib/hooks/use-onboarding-state.ts")
  const result = read("app/onboarding/result/page.tsx")
  const home = read("app/(authed)/home/page.tsx")
  const practice = read("app/(authed)/forge/page.tsx")
  assert.match(onboardingHook, /dataKeys\.onboarding\(\)/)
  assert.match(result, /dataKeys\.onboardingResult\(\)/)
  assert.match(home, /dataKeys\.jobs\(\)/)
  assert.match(practice, /dataKeys\.profile\(\)/)
})
