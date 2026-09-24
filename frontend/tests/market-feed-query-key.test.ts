import test from "node:test"
import assert from "node:assert/strict"

import { feedScope } from "../lib/feed-scope"
import { jobFeedQueryKey } from "../components/market/job-feed-query-key"

const NO_SCOPE = feedScope([])

/**
 * What may and may not evict a cached list.
 *
 * The list takes no parameters, so the key carries identity and the saved
 * location scope and nothing else. Every filter is now applied to the cards in
 * hand, which is what these tests always wanted: a narrowing that re-fetched was
 * spending a request to hide rows it already had.
 */

test("job feed query key changes when saved target locations change", () => {
  const bengaluru = jobFeedQueryKey({ token: "token-1", scope: feedScope(["Bengaluru"]) })
  const gurugram = jobFeedQueryKey({ token: "token-1", scope: feedScope(["Gurugram"]) })

  assert.notDeepEqual(bengaluru, gurugram)
})

test("re-saving the same locations in another order must NOT evict the list", () => {
  const one = jobFeedQueryKey({ token: "t", scope: feedScope([" Gurugram ", "India (All)"]) })
  const two = jobFeedQueryKey({ token: "t", scope: feedScope(["india (all)", "Gurugram"]) })

  assert.deepEqual(one, two)
})

test("two people never share a cached list", () => {
  assert.notDeepEqual(
    jobFeedQueryKey({ token: "a", scope: NO_SCOPE }),
    jobFeedQueryKey({ token: "b", scope: NO_SCOPE }),
  )
})

test("the key carries nothing a filter could change", () => {
  // Work mode used to be a server filter and keyed the query; it is a view filter
  // now, so toggling it must paint instantly from cache. The key is the whole
  // guarantee — if a filter ever appears in it again, this fails.
  assert.deepEqual(jobFeedQueryKey({ token: "t", scope: NO_SCOPE }), [
    "jobFeed",
    "t",
    NO_SCOPE.signature,
  ])
})
