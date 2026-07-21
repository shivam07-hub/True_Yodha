import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  DEFAULT_FILTERS, activeFilterCount, applyViewFilters, localFilters, resetFilters,
} from "../components/market/feed-types"

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8")

/**
 * The market feed had TWO filter implementations: the desktop sheet (full
 * server-filter set) and a private mobile fork carrying two client-side filters
 * and no access to the server ones. These tests hold the single-contract line.
 */

test("mobile does not define its own filters sheet", () => {
  const mobile = read("mobile/redesign/jobs-surface.tsx")
  assert.ok(
    !/function FiltersSheet\(/.test(mobile),
    "mobile re-declared FiltersSheet — the shared sheet in components/market/filters-sheet is the only one",
  )
  assert.match(mobile, /from "@\/components\/market\/filters-sheet"/)
})

test("neither surface hand-rolls the legitimacy/stale filter", () => {
  for (const file of ["mobile/redesign/jobs-surface.tsx", "components/market/jobs-tab.tsx"]) {
    assert.ok(
      !/legitimacy_tier === "caution"/.test(read(file)),
      `${file} re-implements the view filter — call applyViewFilters instead`,
    )
  }
})

test("every server filter reaches the API call", () => {
  const hook = read("components/market/use-job-feed.ts")
  for (const key of ["locationMode", "minSkillMatches", "followingOnly", "includeStretch"]) {
    assert.match(hook, new RegExp(`${key}: filters\\.${key}`), `${key} is never sent to the backend`)
  }
})

test("localFilters carries new filters structurally", () => {
  // A field added to FeedFilters must survive the page → tab → sheet round trip
  // without anyone hand-listing it.
  const local = localFilters(undefined, "fresh")
  const expected = Object.keys(DEFAULT_FILTERS).filter(k => k !== "roleDomain").sort()
  assert.deepEqual(Object.keys(local).sort(), expected)
  assert.equal(local.sort, "fresh")
  assert.equal("roleDomain" in local, false)
})

test("activeFilterCount counts work mode and listing quality", () => {
  assert.equal(activeFilterCount(DEFAULT_FILTERS), 0)
  assert.equal(activeFilterCount({ ...DEFAULT_FILTERS, locationMode: "remote" }), 1)
  assert.equal(activeFilterCount({ ...DEFAULT_FILTERS, hideLowConfidence: true }), 1)
  assert.equal(
    activeFilterCount({ ...DEFAULT_FILTERS, locationMode: "hybrid", hideLowConfidence: true, followingOnly: true }),
    3,
  )
})

test("reset clears every narrowing filter but keeps the rank", () => {
  const cleared = resetFilters({
    ...DEFAULT_FILTERS, sort: "fresh", roleDomain: "Data", minSkillMatches: 3,
    followingOnly: true, includeStretch: true, locationMode: "remote", hideLowConfidence: true,
  })
  assert.equal(activeFilterCount(cleared), 0)
  assert.equal(cleared.sort, "fresh")
})

test("applyViewFilters drops low-confidence and stale cards, and only when asked", () => {
  const items = [
    { job_id: "a", legitimacy_tier: "high_confidence", is_stale: false },
    { job_id: "b", legitimacy_tier: "caution", is_stale: false },
    { job_id: "c", legitimacy_tier: "suspicious", is_stale: false },
    { job_id: "d", legitimacy_tier: "high_confidence", is_stale: true },
    { job_id: "e", legitimacy_tier: undefined, is_stale: undefined },
  ]
  assert.equal(applyViewFilters(items, { hideLowConfidence: false }).length, 5)
  // An unevaluated listing is not evidence of a bad listing — it survives.
  assert.deepEqual(
    applyViewFilters(items, { hideLowConfidence: true }).map(i => i.job_id),
    ["a", "e"],
  )
})
