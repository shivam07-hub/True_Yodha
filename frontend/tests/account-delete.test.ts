/**
 * #61 S8 — Play's web link for deleting an account.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("the deletion page says what goes and how, then opens the existing panel", () => {
  const page = read("app/account/delete/delete-account.tsx")
  assert.match(page, /What is deleted/)
  assert.match(page, /Your CVs and the files uploaded with them/)
  assert.match(page, /Type DELETE/)
  assert.match(page, /Erase permanently/)
  assert.match(page, /<AccountDeletionPanel token=\{token\} \/>/)
  assert.match(page, /stashAccountDeletionReturn\(\)/)
  assert.match(page, /loginRedirectTarget\(\)/)
  assert.doesNotMatch(page, /useAuth\(\)/)
})

test("privacy and the site registry both link the deletion page", () => {
  assert.match(read("app/privacy/page.tsx"), /href="\/account\/delete"/)
  assert.match(read("lib/site-routes.ts"), /path: "\/account\/delete".*route: true/)
})

test("sign-in, sign-up, and the OAuth return all read the deletion flag", () => {
  for (const path of [
    "components/auth/login-form.tsx",
    "components/auth/signup-password-form.tsx",
    "app/auth/callback/page.tsx",
  ]) {
    assert.match(read(path), /accountDeletionReturn: hasAccountDeletionReturn\(\)/, path)
  }
})
