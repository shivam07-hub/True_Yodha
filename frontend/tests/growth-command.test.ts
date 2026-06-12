import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(process.cwd())
const read = (path: string) => readFileSync(resolve(root, path), "utf8")

test("admin growth route mounts the command center and its scoped styles", () => {
  const page = read("app/admin/growth/page.tsx")

  assert.match(page, /growth-command\.css/)
  assert.match(page, /<GrowthCommand/)
})

test("command center uses TanStack Query and the bearer-session growth API", () => {
  const source = read("components/growth/growth-command.tsx")
  const api = read("lib/api.ts")

  assert.match(source, /useQuery/)
  assert.match(source, /useMutation/)
  assert.match(source, /getAccessToken/)
  assert.match(source, /growth\.bootstrap/)
  assert.match(api, /\/growth\/bootstrap/)
  assert.doesNotMatch(source + api, /x-newsletter-agent-token/i)
  assert.doesNotMatch(source + api, /NEXT_PUBLIC_.*ADMIN/i)
})

test("distribution table and review drawer retain tracker working controls", () => {
  const table = read("components/growth/growth-table.tsx")
  const drawer = read("components/growth/growth-review-drawer.tsx")
  const filters = read("components/growth/growth-filters.tsx")

  assert.match(table, /<table/)
  assert.match(table, /aria-label="Distribution messages"/)
  assert.match(filters, /Platform/)
  assert.match(filters, /Status/)
  assert.match(filters, /Format/)
  assert.match(drawer, /<textarea/)
  assert.match(drawer, /Save draft/)
  assert.match(drawer, /Approve/)
  assert.match(drawer, /Open composer/)
  assert.match(drawer, /Mark published/)
  assert.match(drawer, /aria-live="polite"/)
})

test("growth command has a drawer-first 375px layout", () => {
  const css = read("app/admin/growth/growth-command.css")

  assert.match(css, /@media \(max-width: 700px\)/)
  assert.match(css, /\.gc-review-panel/)
  assert.match(css, /position: fixed/)
  assert.match(css, /width: 100%/)
})
