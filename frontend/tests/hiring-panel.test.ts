import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const PANEL = readFileSync("components/hiring/hiring-panel.tsx", "utf8")
const PAGE = readFileSync("app/hiring/page.tsx", "utf8")
const ROUTES = readFileSync("lib/site-routes.ts", "utf8")

test("every rate ships with the count behind it", () => {
  // A sector panel without denominators is a chart, not evidence.
  assert.match(PANEL, /new_roles_30d\)\} of \{formatCount\(sector\.live_roles/)
  assert.match(PANEL, /live_roles_published/)
  assert.match(PANEL, /live_roles_tracked/)
})

test("a withheld cross-reference reads as withheld, not clean", () => {
  // null comes from the Ghost Job Index declining to publish that sector.
  // Rendering it as 0% would invent a claim the index refused to make.
  assert.match(PANEL, /A dash\s+means the index withheld the sector/)
  assert.match(PANEL, /if \(rate === null\) return "—"/)
})

test("a rate never rounds into a boundary it did not reach", () => {
  assert.match(PANEL, /Math\.min\(99, Math\.max\(1, Math\.round\(rate \* 100\)\)\)/)
})

test("the page says it is a panel, not a census", () => {
  // Deep on tracked employers, not wide across Indian hiring. Claiming
  // otherwise is the one thing that would make a buyer distrust the rest.
  assert.match(PANEL, /not a census of Indian hiring/)
})

test("unclassified listings are excluded, never bucketed", () => {
  assert.match(PANEL, /Unclassified is missing data, not a sector/)
})

test("an uncomputed panel is absent, not a page of zeroes", () => {
  assert.match(PAGE, /HiringUnavailable/)
  assert.match(PAGE, /would read as "nothing is hiring"/)
})

test("the panel cross-links the index it borrows from", () => {
  assert.match(PANEL, /href="\/ghost-index"/)
})

test("the route is registered so it reaches footer and sitemap", () => {
  assert.match(ROUTES, /path: "\/hiring".*route: true/)
})

test("copy carries no prose em dash", () => {
  const strings = PANEL.match(/>[^<>{}\n]{12,}</g) ?? []
  for (const s of strings) assert.ok(!s.includes("—") || s.includes("return"), `em dash: ${s}`)
})
