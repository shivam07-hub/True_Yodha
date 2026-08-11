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

test("auth callback selects the Supabase flow from the callback URL and surfaces failures", () => {
  const browserClient = read("lib/supabase.ts")
  const callbackPage = read("app/auth/callback/page.tsx")

  assert.match(browserClient, /flowType: authFlowTypeForUrl\(window\.location\.href\)/)
  assert.match(callbackPage, /supabase\.auth\.initialize\(\)/)
  assert.match(callbackPage, /setFailure\(kind\)/)
  assert.equal(callbackPage.includes('routeOnce("/login")'), false)
})

test("auth entry points route pending anonymous CVs through the CV Playground claim path", () => {
  const loginForm = read("components/auth/login-form.tsx")
  const callbackPage = read("app/auth/callback/page.tsx")

  assert.match(loginForm, /postAuthDestination/)
  assert.match(loginForm, /hasPendingAnonCvClaim/)
  assert.match(callbackPage, /postAuthDestination/)
  assert.match(callbackPage, /hasPendingAnonCvClaim/)
})

test("CV Playground saves pending anonymous CVs through the claim helper", () => {
  const cvPage = read("app/(authed)/cv/page.tsx")

  assert.match(cvPage, /claimPendingAnonCv/)
  assert.equal(cvPage.includes("takeStashedComposedCvText"), false)
})

test("public CV preview keeps the edited composed CV claimable for auth", () => {
  const playground = read("components/public/cv-preview/public-playground.tsx")

  assert.match(playground, /useEffect\(\(\) => \{\s*stashComposedCvText\(composedText\)/)
})

test("core onboarding and recommendation surfaces share canonical data keys", () => {
  const onboardingHook = read("lib/hooks/use-onboarding-state.ts")
  const result = read("app/onboarding/result/page.tsx")
  // Collections replaced the /home dashboard as the saved-worklist surface
  // (2026-07-07 cutover) — it must read matches through the canonical key so
  // the fit rings share the cache with the /market rail.
  const collections = read("components/collections/collections-desktop.tsx")
  const practice = read("app/(authed)/practice/page.tsx")
  assert.match(onboardingHook, /dataKeys\.onboarding\(\)/)
  assert.match(result, /dataKeys\.onboardingResult\(\)/)
  assert.match(collections, /dataKeys\.jobs\(\)/)
  assert.match(practice, /dataKeys\.profile\(\)/)
})
