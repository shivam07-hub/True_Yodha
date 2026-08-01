import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendRoot = join(__dirname, "..")

/**
 * This file used to hardcode `["jobs", "skills"]` and assert `app/<route>/error.tsx`.
 * Both routes moved under `app/(authed)/` and left their boundaries behind, so
 * the assertions were pinned to paths that no longer existed — and because the
 * suite was never wired into CI, nothing reported it. Every authed route ran
 * with no error boundary at all.
 *
 * A hardcoded list also cannot catch the failure that actually matters: a NEW
 * route shipping unprotected. So the covering boundary is asserted at the group
 * segment, and the routes are read off disk.
 */
function segmentsUnder(dir) {
  return readdirSync(join(frontendRoot, dir), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => e.name)
}

test("every authed route is covered by the group error boundary", () => {
  const relative = "app/(authed)/error.tsx"
  const full = join(frontendRoot, relative)

  assert.ok(existsSync(full), `${relative} should exist — it covers every authed route at once`)
  const source = readFileSync(full, "utf8")
  assert.match(source, /AppRouteError/)
  assert.match(source, /surface="app"/)
  assert.match(source, /reset/)

  // Guard the premise: if the authed routes ever stop living under this
  // segment, the single boundary above silently stops covering them.
  const routes = segmentsUnder("app/(authed)")
  assert.ok(routes.length > 0, "app/(authed) should hold the authed route segments")
  assert.ok(routes.includes("cv"), "cv should sit under the covered segment")
  assert.ok(routes.includes("market"), "market should sit under the covered segment")
})

test("the app-surface error branch is actually reachable", () => {
  // The whole point of the boundary above. `surface="app"` sat unused for
  // months once the two per-route files disappeared; dead UI cannot be trusted
  // to render, so assert something mounts it.
  const mounts = []
  const walk = (dir) => {
    for (const entry of readdirSync(join(frontendRoot, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(rel)
      else if (entry.name === "error.tsx" && readFileSync(join(frontendRoot, rel), "utf8").includes('surface="app"')) {
        mounts.push(rel)
      }
    }
  }
  walk("app")
  assert.ok(mounts.length > 0, 'no error.tsx renders AppRouteError with surface="app"')
})

test("public intel route has a public-shell error boundary", () => {
  const relative = "app/intel/error.tsx"
  const full = join(frontendRoot, relative)

  assert.ok(existsSync(full), `${relative} should exist`)
  const source = readFileSync(full, "utf8")
  assert.match(source, /AppRouteError/)
  assert.match(source, /surface="public"/)
})
