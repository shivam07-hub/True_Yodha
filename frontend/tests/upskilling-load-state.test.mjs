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
