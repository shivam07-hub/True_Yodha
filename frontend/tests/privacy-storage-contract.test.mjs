import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("authenticated query data is not persisted to localStorage", () => {
  const providers = read("components/providers.tsx")
  const identity = read("lib/identity-cache.ts")
  const cache = read("lib/local-cache.ts")

  assert.equal(providers.includes("PersistQueryClientProvider"), false)
  assert.equal(identity.includes("localStorage"), false)
  assert.equal(cache.includes("localStorage"), false)
})

test("tokens and CV drafts use tab-scoped storage", () => {
  const session = read("lib/session.ts")
  const autosave = read("lib/hooks/use-master-autosave.ts")
  const supabase = read("lib/supabase.ts")

  assert.equal(session.includes("localStorage"), false)
  assert.equal(session.includes("sessionStorage"), true)
  assert.equal(autosave.includes("localStorage"), false)
  assert.equal(autosave.includes("sessionStorage"), true)
  assert.equal(supabase.includes("sessionStorage"), true)
  assert.equal(supabase.includes("createBrowserClient"), false)
})

test("third-party scripts are loaded only at the point of use", () => {
  const layout = read("app/layout.tsx")

  assert.equal(layout.includes("googletagmanager.com"), false)
  assert.equal(layout.includes("checkout.razorpay.com"), false)
})

test("settings exposes the authenticated account deletion flow", () => {
  const settings = read("components/settings-modal.tsx")
  const api = read("lib/api.ts")

  assert.equal(settings.includes("<AccountDeletionPanel token={token} />"), true)
  assert.match(api, /deleteAccount:[\s\S]*method: "DELETE"/)
})
