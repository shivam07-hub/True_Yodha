import test from "node:test"
import assert from "node:assert/strict"

import {
  COMPANY_SIGNAL_FETCH_LIMIT,
  companySignalRows,
  companySignalHeading,
  companySignalMeta,
  companySignalSortParam,
} from "../components/market/company-signals-model"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendRoot = join(__dirname, "..")

function read(relativePath: string): string {
  return readFileSync(join(frontendRoot, relativePath), "utf8")
}

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
    "4 Jun · 1 role",
  )
  assert.equal(companySignalMeta({ openCount: 7, lastSeenAt: null }, "scraped"), "date n/a · 7 roles")
  assert.equal(companySignalSortParam("scraped"), "last_seen")
})

test("company signal rail keeps every fetched company available", () => {
  const rows = companySignalRows([
    { company_name: "Siemens", open_count: 209, last_seen_at: "2026-06-06T00:00:00+00:00" },
    { company_name: "KPMG India", open_count: 123, last_seen_at: "2026-06-05T00:00:00+00:00" },
    { company_name: "EY India Experienced", open_count: 119, last_seen_at: "2026-06-04T00:00:00+00:00" },
    { company_name: "Accenture", open_count: 51, last_seen_at: "2026-06-03T00:00:00+00:00" },
    { company_name: "Deloitte", open_count: 48, last_seen_at: "2026-06-02T00:00:00+00:00" },
    { company_name: "PwC India", open_count: 40, last_seen_at: "2026-06-01T00:00:00+00:00" },
  ])

  assert.equal(COMPANY_SIGNAL_FETCH_LIMIT, 20)
  assert.deepEqual(
    rows.map((row) => row.name),
    ["Siemens", "KPMG India", "EY India Experienced", "Accenture", "Deloitte", "PwC India"],
  )
})

test("company signal card renders rows inside a scrollable list", () => {
  const source = read("components/market/market-rail.tsx")
  const styles = read("components/market/market-intel.css")

  assert.match(source, /className="mi-company-list"/)
  assert.match(styles, /\.mi-company-list\s*\{[\s\S]*max-height:/)
  assert.match(styles, /\.mi-company-list\s*\{[\s\S]*overflow-y:\s*auto/)
  assert.match(styles, /\.mi-company-list\s*\{[\s\S]*-webkit-overflow-scrolling:\s*touch/)
})
