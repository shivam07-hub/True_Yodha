import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const drawer = readFileSync(new URL("../components/market/job-detail-drawer.tsx", import.meta.url), "utf8")
const phone = readFileSync(new URL("../mobile/redesign/job-detail-sheet.tsx", import.meta.url), "utf8")

test("the live job panel shows listing liveness and the employer record", () => {
  for (const source of [drawer, phone]) {
    assert.match(source, /<ListingLiveness/)
    assert.match(source, /<EmployerRecordNote/)
  }
})
