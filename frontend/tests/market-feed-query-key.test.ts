import test from "node:test"
import assert from "node:assert/strict"

import { DEFAULT_FILTERS } from "../components/market/feed-types"
import { jobFeedQueryKey, targetLocationSignature } from "../components/market/job-feed-query-key"

test("target location signature is stable across whitespace and order", () => {
  assert.equal(
    targetLocationSignature([" Gurugram ", "India (All)"]),
    targetLocationSignature(["india (all)", "Gurugram"]),
  )
})

test("job feed query key changes when saved target locations change", () => {
  const bengaluruKey = jobFeedQueryKey({
    token: "token-1",
    filters: DEFAULT_FILTERS,
    q: "",
    skill: null,
    targetLocations: ["Bengaluru"],
  })
  const gurugramKey = jobFeedQueryKey({
    token: "token-1",
    filters: DEFAULT_FILTERS,
    q: "",
    skill: null,
    targetLocations: ["Gurugram"],
  })

  assert.notDeepEqual(bengaluruKey, gurugramKey)
})

test("work mode is a server filter, so it keys the query", () => {
  const any = jobFeedQueryKey({ token: "t", filters: DEFAULT_FILTERS, q: "", skill: null, targetLocations: [] })
  const remote = jobFeedQueryKey({
    token: "t",
    filters: { ...DEFAULT_FILTERS, locationMode: "remote" },
    q: "",
    skill: null,
    targetLocations: [],
  })
  assert.notDeepEqual(any, remote)
})

test("hideLowConfidence is view-scope, so it must NOT evict the feed cache", () => {
  const off = jobFeedQueryKey({ token: "t", filters: DEFAULT_FILTERS, q: "", skill: null, targetLocations: [] })
  const on = jobFeedQueryKey({
    token: "t",
    filters: { ...DEFAULT_FILTERS, hideLowConfidence: true },
    q: "",
    skill: null,
    targetLocations: [],
  })
  assert.deepEqual(off, on)
})
