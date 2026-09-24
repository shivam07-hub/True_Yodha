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
 *
 * There are no server filters left to reach. The list is finite, so every
 * narrowing is a view filter over cards already in hand — which makes the parity
 * question sharper, not softer: one `applyViewFilters` for both skins, or they
 * drift again.
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

test("the list is read with no filter parameters at all", () => {
  const hook = read("components/market/use-job-feed.ts")
  assert.match(hook, /jobs\.feed\(token\)/, "the list takes no parameters")
  // A filter on the wire would be a filter retrieval cannot honour, and silence
  // would be the answer.
  for (const gone of ["sort:", "minSkillMatches", "followingOnly", "includeStretch", "browseScope", "pageParam"]) {
    assert.ok(!hook.includes(gone), `${gone} outlived the browse feed that read it`)
  }
})

test("both skins narrow through the one pass", () => {
  for (const file of ["mobile/redesign/jobs-surface.tsx", "components/market/use-job-feed.ts"]) {
    assert.match(read(file), /applyViewFilters/, `${file} must narrow through the shared pass`)
  }
})

test("localFilters carries new filters structurally", () => {
  // A field added to FeedFilters must survive the page → tab → sheet round trip
  // without anyone hand-listing it.
  const local = localFilters(undefined)
  assert.deepEqual(Object.keys(local).sort(), Object.keys(DEFAULT_FILTERS).sort())
})

test("activeFilterCount counts work mode and listing quality", () => {
  assert.equal(activeFilterCount(DEFAULT_FILTERS), 0)
  assert.equal(activeFilterCount({ ...DEFAULT_FILTERS, locationMode: "remote" }), 1)
  assert.equal(activeFilterCount({ ...DEFAULT_FILTERS, hideLowConfidence: true }), 1)
  assert.equal(
    activeFilterCount({ ...DEFAULT_FILTERS, locationMode: "hybrid", hideLowConfidence: true }),
    2,
  )
  // The role chips are their own always-visible row, so they never count here.
  assert.equal(activeFilterCount({ ...DEFAULT_FILTERS, roleFamily: "Software Development" }), 0)
})

test("reset clears every filter, role chip included", () => {
  const cleared = resetFilters({
    roleFamily: "Data", locationMode: "remote", hideLowConfidence: true,
  })
  assert.equal(activeFilterCount(cleared), 0)
  assert.equal(cleared.roleFamily, null)
})

type Card = Parameters<typeof applyViewFilters>[0][number] & { job_id: string }

const card = (job_id: string, over: Partial<Card> = {}): Card => ({
  job_id, job_title: "Engineer", company_name: "Acme", skills: ["Python"],
  legitimacy_tier: "high_confidence", is_stale: false,
  location_mode: "onsite", role_family: "Software Development", ...over,
})

test("applyViewFilters drops low-confidence and stale cards, and only when asked", () => {
  const items = [
    card("a"),
    card("b", { legitimacy_tier: "caution" }),
    card("c", { legitimacy_tier: "suspicious" }),
    card("d", { is_stale: true }),
    card("e", { legitimacy_tier: undefined, is_stale: undefined }),
  ]
  assert.equal(applyViewFilters(items, { ...DEFAULT_FILTERS }).length, 5)
  // An unevaluated listing is not evidence of a bad listing — it survives.
  assert.deepEqual(
    applyViewFilters(items, { ...DEFAULT_FILTERS, hideLowConfidence: true }).map(i => i.job_id),
    ["a", "e"],
  )
})

test("a role chip narrows to its own family", () => {
  const items = [card("a"), card("b", { role_family: "Banking Services" })]
  assert.deepEqual(
    applyViewFilters(items, { ...DEFAULT_FILTERS, roleFamily: "Software Development" }).map(i => i.job_id),
    ["a"],
  )
})

test("search looks at the list, not the corpus", () => {
  // Corpus-wide search is ⌘K (/jobs/search/global). This finds the one card among
  // forty, by title or company, and never asks the server.
  const items = [card("a", { job_title: "Data Engineer" }), card("b", { company_name: "Google" })]
  assert.deepEqual(applyViewFilters(items, DEFAULT_FILTERS, { q: "goog" }).map(i => i.job_id), ["b"])
  assert.deepEqual(applyViewFilters(items, DEFAULT_FILTERS, { q: "data" }).map(i => i.job_id), ["a"])
  assert.equal(applyViewFilters(items, DEFAULT_FILTERS, { q: "  " }).length, 2)
})

test("a skill chip keeps only cards that need that skill", () => {
  const items = [card("a"), card("b", { skills: ["Kafka"] })]
  assert.deepEqual(applyViewFilters(items, DEFAULT_FILTERS, { skill: "python" }).map(i => i.job_id), ["a"])
})
