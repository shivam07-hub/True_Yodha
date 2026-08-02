import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const pageSource = readFileSync(
  new URL("../app/(authed)/cv/page.tsx", import.meta.url),
  "utf8",
)
const hookSource = readFileSync(
  new URL("../lib/hooks/use-cv-playground.ts", import.meta.url),
  "utf8",
)

test("structured CV loading has finite loading, failure, and retry states", () => {
  assert.match(pageSource, /playground\.structuredQuery\.isError/)
  assert.match(pageSource, /playground\.structuredQuery\.refetch/)
  assert.match(pageSource, /<CvStructuredRecovery/)
  assert.match(pageSource, /playground\.structuredQuery\.isLoading/)
  assert.doesNotMatch(
    pageSource,
    /\(view === "master-edit" \|\| \(view === "playground" && jobId\)\) && !cvData/,
  )
})

test("structured CV loading retries once before showing recovery", () => {
  assert.match(hookSource, /retry: 1,/)
})
