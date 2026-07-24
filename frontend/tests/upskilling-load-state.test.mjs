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
const rungPathSource = readFileSync(
  join(__dirname, "..", "components", "skills", "upskilling", "rung-path.tsx"),
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

test("the Forge climb path opens banked rungs and the next focus rung, keeps the rest locked", () => {
  // Myro Forge redesign: banked (re-practice) and the immediate next rung are
  // startable; anything beyond that stays locked regardless of bank
  // readiness — the rare "bank is ready two levels ahead" case is no longer
  // previewed as a shortcut (startSet()'s catch still toasts if it fails).
  assert.match(rungPathSource, /banked \|\| focus \? \(\) => onStart\(lvl\) : null/)
  assert.match(rungPathSource, /const focus = !maxed && lvl === next/)
  assert.doesNotMatch(resultsSource, /stays locked until/)
  assert.match(resultsSource, /Levels stay available for practice/)
})
