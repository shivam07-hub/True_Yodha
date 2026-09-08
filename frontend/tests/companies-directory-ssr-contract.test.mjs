import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(
  new URL("../components/companies/companies-directory.tsx", import.meta.url),
  "utf8",
)

test("directory recovery defers its browser API module until a retry is needed", () => {
  assert.doesNotMatch(source, /import\s*\{\s*jobs\s*,\s*type CompanyPulseItem\s*\}/)
  assert.match(source, /queryFn:\s*async \(\) => \(await import\("@\/lib\/api"\)\)\.jobs\.indexableCompanies\(\)/)
})

test("following a company happens only after the user presses its control", () => {
  // The guarantee is that the anonymous branch ROUTES on the press and never
  // follows. This used to pin the navigation mechanism — the literal
  // `window.location.href` — so it failed the moment that full document reload
  // became a route change, even though the guarantee was untouched. Assert the
  // destination and where it sits, not the API used to reach it.
  assert.match(source, /toggle:\s*\(\)\s*=>\s*\{[^}]*"\/signup\?ref=companies"/)
  // And it must stay a route change: a reload here rebuilds the directory the
  // reader is standing in.
  assert.doesNotMatch(source, /window\.location\.(href|assign|replace)/)
})
