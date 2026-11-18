/**
 * R3: the market card says why, from pick_reason only.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { readerLine } from "../lib/jobs/reader-line"

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("a blank reason is no line, and summary is never the line", () => {
  assert.equal(readerLine({ pick_reason: "  You ran the billing rewrite.  " }), "You ran the billing rewrite.")
  assert.equal(readerLine({ pick_reason: "   " }), null)
  assert.equal(readerLine({ pick_reason: null }), null)
  assert.equal(readerLine({}), null)
})

test("the market card gets the reader line and never the summary", () => {
  const column = read("components/market/market-jobs-column.tsx")
  const take = read("components/jobs/myro-take.tsx")
  assert.match(column, /lede=\{readerLine\(row\.job\)/)
  assert.doesNotMatch(column, /lede=\{[^}]*summary/)
  assert.match(take, /readerLine\(r\)/)
  assert.doesNotMatch(take, /pick_reason \|\| .*\.summary/)
})
