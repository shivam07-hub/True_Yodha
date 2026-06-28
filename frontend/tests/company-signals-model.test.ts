import test from "node:test"
import assert from "node:assert/strict"

import {
  companySignalHeading,
  companySignalMeta,
  companySignalSortParam,
} from "../components/market/company-signals-model"

test("company signal card uses an honest non-trending heading", () => {
  assert.equal(companySignalHeading(), "Company signals")
})

test("role mode shows the open-role count only", () => {
  assert.equal(companySignalMeta({ openCount: 181, lastSeenAt: "2026-06-04T00:00:00+00:00" }, "roles"), "181 roles")
  assert.equal(companySignalSortParam("roles"), "roles")
})

test("scraped mode shows latest scrape date and role count", () => {
  assert.equal(
    companySignalMeta({ openCount: 1, lastSeenAt: "2026-06-04T00:00:00+00:00" }, "scraped"),
    "Jun 4 · 1 role",
  )
  assert.equal(companySignalMeta({ openCount: 7, lastSeenAt: null }, "scraped"), "date n/a · 7 roles")
  assert.equal(companySignalSortParam("scraped"), "last_seen")
})
