import test from "node:test"
import assert from "node:assert/strict"

import { applyPriorityOptimistic, mergePriorityResult } from "../lib/collections/use-job-priority"
import { applySnoozeOptimistic, snoozeUntil } from "../lib/collections/use-collection-snooze"
import type { ApplicationResponse } from "../lib/api"

/** The one priority toggle, shared by desktop Collections and mobile.
 *  The heart must fill on tap, not after the round trip. */

const app = (over: Partial<ApplicationResponse>): ApplicationResponse =>
  ({ job_id: "j", title: "Role", company: "Acme", status: "saved", is_priority: false, ...over }) as ApplicationResponse

test("the tap is believed immediately — the row flips before any response", () => {
  const next = applyPriorityOptimistic([app({ job_id: "a" }), app({ job_id: "b" })], "a", true)
  assert.equal(next?.find(r => r.job_id === "a")?.is_priority, true)
  assert.equal(next?.find(r => r.job_id === "b")?.is_priority, false)
})

test("un-prioritising is equally immediate", () => {
  const next = applyPriorityOptimistic([app({ job_id: "a", is_priority: true })], "a", false)
  assert.equal(next?.[0].is_priority, false)
})

test("the optimistic pass never mutates the cached array in place", () => {
  // A rollback restores `previous`; if we mutated the same objects there would
  // be nothing left to roll back to.
  const before = [app({ job_id: "a" })]
  const next = applyPriorityOptimistic(before, "a", true)
  assert.equal(before[0].is_priority, false)
  assert.notEqual(next?.[0], before[0])
})

test("an empty cache stays empty rather than inventing a row", () => {
  assert.equal(applyPriorityOptimistic(undefined, "a", true), undefined)
})

test("server truth replaces the optimistic row", () => {
  const merged = mergePriorityResult([app({ job_id: "a", is_priority: true })], app({ job_id: "a", is_priority: true, company: "Real Co" }))
  assert.equal(merged.length, 1)
  assert.equal(merged[0].company, "Real Co")
})

test("a row the cache never held is appended, not dropped", () => {
  const merged = mergePriorityResult([app({ job_id: "a" })], app({ job_id: "new", is_priority: true }))
  assert.equal(merged.length, 2)
  assert.equal(merged.find(r => r.job_id === "new")?.is_priority, true)
})

/* ── Snooze: same contract, both platforms ─────────────────────────────────
   Snoozing only quiets the attention badge — no list filters on it — so
   without an optimistic write nothing on screen moves and the button reads
   as dead. This was true on desktop AND mobile. */

test("a snooze is quiet from the tap, not from the response", () => {
  const until = snoozeUntil(new Date("2026-08-26T00:00:00Z"))
  const next = applySnoozeOptimistic([app({ job_id: "a" }), app({ job_id: "b" })], "a", until)
  assert.equal(next?.find(r => r.job_id === "a")?.collection_snoozed_until, until)
  assert.equal(next?.find(r => r.job_id === "b")?.collection_snoozed_until, undefined)
})

test("snoozeUntil lands three days out", () => {
  assert.equal(snoozeUntil(new Date("2026-08-26T00:00:00Z")), "2026-08-29T00:00:00.000Z")
})

test("the snooze pass does not mutate the cached row in place", () => {
  const before = [app({ job_id: "a" })]
  applySnoozeOptimistic(before, "a", "2026-08-29T00:00:00.000Z")
  assert.equal(before[0].collection_snoozed_until, undefined)
})
