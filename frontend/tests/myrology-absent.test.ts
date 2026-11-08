/**
 * #61 S3 — Myrology is absent inside the Android app. The web still offers it.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")

const DOORS = [
  "../lib/hooks/use-nav-unlocks.ts",
  "../mobile/redesign/profile-surface.tsx",
  "../components/cv/builder/persona-canvas.tsx",
  "../components/shell/authed-top-strip.tsx",
  "../components/public/public-footer.tsx",
  "../components/settings-modal.tsx",
]

test("every Myrology door asks whether this is the Android app", () => {
  for (const path of DOORS) {
    const text = read(path)
    assert.match(text, /useIsAndroidApp/, path)
  }
})

test("the profile list drops the Myrology row inside the app", () => {
  const text = read("../mobile/redesign/profile-surface.tsx")
  assert.match(text, /inApp \? \[\] : \[\{ label: "Myrology/)
})

test("the nav cluster drops Myrology inside the app", () => {
  const text = read("../lib/hooks/use-nav-unlocks.ts")
  assert.match(text, /const myrologyVisible = !inApp &&/)
})

test("the footer drops a sale path inside the app and keeps the registry", () => {
  const footer = read("../components/public/public-footer.tsx")
  const routes = read("../lib/site-routes.ts")
  assert.match(footer, /isSalePath\(link\.href\)/)
  assert.match(routes, /path: "\/myrology"/)
})
