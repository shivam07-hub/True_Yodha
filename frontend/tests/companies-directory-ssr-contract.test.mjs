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
  assert.match(source, /toggle:\s*\(\)\s*=>\s*\{\s*window\.location\.href = "\/signup\?ref=companies"/)
})
