import test from "node:test"
import assert from "node:assert/strict"

import { firstRunFromData } from "../lib/nav-items"
import type { CVVersion, CVVersionKind } from "../lib/api"

// Minimal CVVersion — only `kind` and `company_name` drive the first-run gate.
function ver(kind: CVVersionKind, company: string | null = null): CVVersion {
  return {
    id: 1,
    user_version_number: 1,
    kind,
    job_id: null,
    parent_version_id: null,
    baseline_version_id: null,
    title: null,
    hidden_items: [],
    edited_items: {},
    body_text: "",
    polished_text: null,
    ai_polished: false,
    created_at: "2026-01-01T00:00:00Z",
    job_title: null,
    company_name: company,
  }
}

const profile = { myrology_interested: false, myrology_unlocked: false }

test("unknown (queries unresolved) reads NOT first-run — kills the pill flash", () => {
  // The bug: deriveNavUnlockCtx(undefined) collapses to tailoredCount 0, which
  // would make a returning user look first-run mid-load. Unknown must be false.
  assert.equal(firstRunFromData(undefined, undefined), false)
  assert.equal(firstRunFromData(undefined, profile), false)
  assert.equal(firstRunFromData([], undefined), false)
})

test("resolved with zero tailored versions = PROVEN first-run", () => {
  assert.equal(firstRunFromData([], profile), true)
  assert.equal(firstRunFromData([ver("baseline_upload")], profile), true)
})

test("resolved with a tailored version = returning (not first-run)", () => {
  assert.equal(
    firstRunFromData([ver("baseline_upload"), ver("deterministic", "Acme")], profile),
    false,
  )
  assert.equal(firstRunFromData([ver("polished", "Acme")], profile), false)
})
