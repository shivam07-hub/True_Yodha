import test from "node:test"
import assert from "node:assert/strict"

import type { CollectionResponse, CollectionStage } from "../lib/api"
import { deriveJourneyCounts } from "../components/nav/journey-counts"

const record = (stages: Partial<Record<CollectionStage, number>>): CollectionResponse => ({
  entries: [],
  stages: { found: 0, saved: 0, tailored: 0, applied: 0, closed: 0, ...stages },
  landing: "found",
  below_bar_count: 0,
  rejected_count: 0,
  match_health: "vetted",
})

test("the nav reads the resolver's counts, not its own derivation", () => {
  const counts = deriveJourneyCounts(record({ saved: 3, tailored: 2, applied: 1 }))
  assert.deepEqual(counts, { collected: 3, tailored: 2, liveRooms: 1 })
})

test("found is not collected — nothing has been claimed yet", () => {
  // Counting Myro's offer as the user's pipeline made the badge promise work
  // they had never agreed to do.
  assert.equal(deriveJourneyCounts(record({ found: 12 })).collected, 0)
})

test("closed rows never reach the badge", () => {
  // The badge used to count raw applications, closed listings included, while
  // the surface moved those to their own chip — so it counted rows it then hid.
  assert.deepEqual(
    deriveJourneyCounts(record({ saved: 2, closed: 9 })),
    { collected: 2, tailored: 0, liveRooms: 0 },
  )
})

test("an empty collection counts nothing", () => {
  assert.deepEqual(deriveJourneyCounts(record({})), { collected: 0, tailored: 0, liveRooms: 0 })
})
