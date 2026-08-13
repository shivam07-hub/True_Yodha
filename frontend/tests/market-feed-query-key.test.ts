import test from "node:test"
import assert from "node:assert/strict"

import { feedScope } from "../lib/feed-scope"
import { DEFAULT_FILTERS } from "../components/market/feed-types"
import { jobFeedQueryKey } from "../components/market/job-feed-query-key"

const NO_SCOPE = feedScope([])

test("job feed query key changes when saved target locations change", () => {
  const bengaluruKey = jobFeedQueryKey({
    token: "token-1",
    filters: DEFAULT_FILTERS,
    q: "",
    skill: null,
    scope: feedScope(["Bengaluru"]),
  })
  const gurugramKey = jobFeedQueryKey({
    token: "token-1",
    filters: DEFAULT_FILTERS,
    q: "",
    skill: null,
    scope: feedScope(["Gurugram"]),
  })

  assert.notDeepEqual(bengaluruKey, gurugramKey)
})

test("re-saving the same locations in another order must NOT evict the feed", () => {
  const one = jobFeedQueryKey({
    token: "t", filters: DEFAULT_FILTERS, q: "", skill: null,
    scope: feedScope([" Gurugram ", "India (All)"]),
  })
  const two = jobFeedQueryKey({
    token: "t", filters: DEFAULT_FILTERS, q: "", skill: null,
    scope: feedScope(["india (all)", "Gurugram"]),
  })

  assert.deepEqual(one, two)
})

test("work mode is a server filter, so it keys the query", () => {
  const any = jobFeedQueryKey({ token: "t", filters: DEFAULT_FILTERS, q: "", skill: null, scope: NO_SCOPE })
  const remote = jobFeedQueryKey({
    token: "t",
    filters: { ...DEFAULT_FILTERS, locationMode: "remote" },
    q: "",
    skill: null,
    scope: NO_SCOPE,
  })
  assert.notDeepEqual(any, remote)
})

test("hideLowConfidence is view-scope, so it must NOT evict the feed cache", () => {
  const off = jobFeedQueryKey({ token: "t", filters: DEFAULT_FILTERS, q: "", skill: null, scope: NO_SCOPE })
  const on = jobFeedQueryKey({
    token: "t",
    filters: { ...DEFAULT_FILTERS, hideLowConfidence: true },
    q: "",
    skill: null,
    scope: NO_SCOPE,
  })
  assert.deepEqual(off, on)
})
