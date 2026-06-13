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

test("hosted tracker preserves the original three workspaces", () => {
  const command = read("components/growth/growth-command.tsx")

  assert.match(command, /Postings pipeline/)
  assert.match(command, /Newsletter issues/)
  assert.match(command, /Seeding sweeps/)
  assert.doesNotMatch(command, /GrowthReviewDrawer/)
})

test("pipeline retains the complete human publishing loop", () => {
  const table = read("components/growth/growth-table.tsx")
  const workbench = read("components/growth/growth-workbench.tsx")
  const filters = read("components/growth/growth-filters.tsx")
  const pipeline = table + workbench

  assert.match(table, /<table/)
  assert.match(table, /aria-label="Distribution messages"/)
  assert.match(pipeline, /Copy draft/)
  assert.match(pipeline, /Open composer/)
  assert.match(pipeline, /Prepared baseline/)
  assert.match(pipeline, /What actually went out/)
  assert.match(table, /Impressions/)
  assert.match(table, /Clicks/)
  assert.match(pipeline, /Mark posted/)
  assert.match(table, /key={`\$\{message\.id\}:\$\{publication\?\.id/)
  assert.match(filters, /Platform/)
  assert.match(filters, /Status/)
  assert.match(filters, /Type/)
  assert.match(filters, /Save snapshot/)
  assert.match(filters, /Load snapshot/)
  assert.match(filters, /\["draft", "posted", "paused"\]/)
})

test("tracker includes operational charts, issue cards, and sweep reader", () => {
  const charts = read("components/growth/growth-charts.tsx")
  const issues = read("components/growth/growth-issues.tsx")
  const sweeps = read("components/growth/growth-sweeps.tsx")

  assert.match(charts, /BarChart/)
  assert.match(charts, /PieChart/)
  assert.match(issues, /Open issue/)
  assert.match(sweeps, /Seeding sweep/)
})

test("growth command keeps inline work rows on mobile", () => {
  const css = read("app/admin/growth/growth-command.css")

  assert.match(css, /@media \(max-width: 700px\)/)
  assert.match(css, /\.gc-workbench/)
  assert.match(css, /overflow-x: auto/)
  assert.doesNotMatch(css, /\.gc-review-panel[\s\S]*position: fixed/)
})
