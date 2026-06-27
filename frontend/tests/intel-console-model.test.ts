import test from "node:test"
import assert from "node:assert/strict"

import {
  RUNNER_MODEL_LABELS,
  buildConsoleSeeds,
} from "../components/public/intel/intel-console-model"

test("console seeds preserve exact tracked company names from analytics", () => {
  const seeds = buildConsoleSeeds([
    { name: "Deloitte India", count: 42, last_seen_at: "2026-06-04T00:00:00+00:00" },
    { name: "Razorpay", count: 7, last_seen_at: null },
  ])

  assert.deepEqual(seeds.map((seed) => seed.path), ["Deloitte India", "Razorpay"])
  assert.equal(seeds[0].meta, "42 jobs - scraped 2026-06-04")
  assert.equal(seeds[1].meta, "7 jobs - tracked")
})

test("console fallback never invents a company name", () => {
  const seeds = buildConsoleSeeds([])

  assert.equal(seeds.length, 1)
  assert.equal(seeds[0].path, "tracked company feed")
  assert.equal(seeds[0].meta, "syncing")
})

test("runner model labels describe the local scraper enrichment model", () => {
  assert.deepEqual(RUNNER_MODEL_LABELS, ["Local LM Studio", "google/gemma-3-4b"])
})
