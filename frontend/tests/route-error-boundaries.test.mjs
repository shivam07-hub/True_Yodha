import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendRoot = join(__dirname, "..")

// tracker route removed (tracker→CV merge 2026-06-02); its surface lives in /cv now.
const protectedRoutes = ["jobs", "skills"]

test("core app routes have retryable error boundaries", () => {
  for (const route of protectedRoutes) {
    const relative = `app/${route}/error.tsx`
    const full = join(frontendRoot, relative)

    assert.ok(existsSync(full), `${relative} should exist`)
    const source = readFileSync(full, "utf8")
    assert.match(source, /AppRouteError/)
    assert.match(source, /reset/)
  }
})

test("public intel route has a public-shell error boundary", () => {
  const relative = "app/intel/error.tsx"
  const full = join(frontendRoot, relative)

  assert.ok(existsSync(full), `${relative} should exist`)
  const source = readFileSync(full, "utf8")
  assert.match(source, /AppRouteError/)
  assert.match(source, /surface="public"/)
})
