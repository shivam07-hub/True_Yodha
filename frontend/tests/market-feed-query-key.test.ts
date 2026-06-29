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
