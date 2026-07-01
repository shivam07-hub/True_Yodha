import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(
  join(__dirname, "..", "components", "skills", "upskilling", "upskilling-view.tsx"),
  "utf8",
)
const primitivesSource = readFileSync(
  join(__dirname, "..", "components", "skills", "upskilling", "primitives.tsx"),
  "utf8",
)
const resultsSource = readFileSync(
  join(__dirname, "..", "components", "skills", "upskilling", "results.tsx"),
  "utf8",
)

test("upskilling distinguishes an API failure from an empty question bank", () => {
  assert.match(source, /isError/)
  assert.match(source, /refetch/)
  assert.match(source, /isFetching/)
  assert.match(source, /role="alert"/)
  assert.match(source, /Couldn.t load your upskilling ladder/)
  assert.match(source, /onClick=\{\(\) => void refetch\(\)\}/)
  assert.match(source, />\s*Retry\s*</)
  assert.match(source, /Your upskilling ladder is on the way/)
})

test("upskilling WIP opens every banked ladder level", () => {
  assert.match(primitivesSource, /const startable = bankOk && Boolean\(onStart\)/)
  assert.doesNotMatch(primitivesSource, /Level \$\{lvl\} locked/)
  assert.doesNotMatch(resultsSource, /stays locked until/)
  assert.match(resultsSource, /Levels stay available for practice/)
})
