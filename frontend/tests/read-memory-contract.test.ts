import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

import { QUERY_MEMORY_POLICY } from "../lib/query-client"

test("authenticated query memory survives route changes without focus bursts", () => {
  assert.equal(QUERY_MEMORY_POLICY.gcTime, 30 * 60 * 1000)
  assert.equal(QUERY_MEMORY_POLICY.refetchOnWindowFocus, false)
  assert.equal(QUERY_MEMORY_POLICY.refetchOnReconnect, false)
})

test("non-dashboard surfaces do not fetch the full Home bundle", () => {
  const market = readFileSync(resolve("app/(authed)/market/page.tsx"), "utf8")
  const intel = readFileSync(resolve("components/public/intel-pane.tsx"), "utf8")

  assert.equal(market.includes("useHomeBootstrap"), false)
  assert.equal(intel.includes("home.bootstrap"), false)
})
