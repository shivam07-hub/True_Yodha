import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const BAND = readFileSync("components/market/sector-band.tsx", "utf8")
const HEATMAP = readFileSync("components/market/heatmap-tab.tsx", "utf8")

test("the band renders before the CV prerequisite branch", () => {
  // The heatmap needs a CV, a skill map and followed companies. Sector data
  // needs none of them, so this is the one thing on the page that works for
  // someone who signed up ten minutes ago.
  // Compare the JSX USES, not the imports: `CVPrerequisiteCard` is imported at
  // the top of the file, so a bare indexOf finds the import line and every
  // ordering assertion against it is meaningless.
  const band = HEATMAP.indexOf("<SectorBand />")
  const gate = HEATMAP.indexOf("<CVPrerequisiteCard")
  assert.ok(band > -1 && gate > -1)
  assert.ok(band < gate, "the band must not sit behind the CV gate")
})

test("it opens the full panel", () => {
  // The panel has been public since it shipped and reachable only from a footer
  // the authed shell does not render. This is the connection it never had.
  assert.match(BAND, /href="\/hiring"/)
})

test("a failed or empty fetch renders nothing", () => {
  // A broken band above content the reader has started is worse than no band.
  assert.match(BAND, /if \(!data\?\.sectors\?\.length\) return null/)
})

test("a rate never rounds into a boundary it did not reach", () => {
  assert.match(BAND, /Math\.min\(99, Math\.max\(1, Math\.round\(rate \* 100\)\)\)/)
  assert.match(BAND, /if \(rate === null\) return "—"/)
})

test("the withheld cross-reference stays withheld here too", () => {
  // still_advertised_rate is null when the Ghost Job Index declined to publish
  // that sector. It must render as a dash, never as 0%.
  assert.match(BAND, /pct\(s\.still_advertised_rate\)/)
})

test("one shared query for the panel", () => {
  assert.match(BAND, /queryKey: \["hiring-panel"\]/)
})

test("figures carry their units in words", () => {
  assert.ok(BAND.includes("</b> live"))
  assert.ok(BAND.includes("new in 30d"))
  assert.ok(BAND.includes("still up after closing"))
})
