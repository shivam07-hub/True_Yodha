import test from "node:test"
import assert from "node:assert/strict"

import { EMPTY_FEED_SCOPE, feedScope } from "../lib/feed-scope"

test("a blank first entry must not become the city", () => {
  // The drift this module exists to kill: the heatmap read `targetLocations[0]`
  // raw and labelled itself "" while every other surface said "Gurugram".
  const scope = feedScope(["   ", "Gurugram", "Kochi"])
  assert.equal(scope.city, "Gurugram")
  assert.equal(scope.label, "Gurugram +1")
  assert.deepEqual(scope.cities, ["Gurugram", "Kochi"])
})

test("one saved city labels as itself, several carry a +N", () => {
  assert.equal(feedScope(["Gurugram"]).label, "Gurugram")
  assert.equal(feedScope(["Gurugram", "Kochi", "Pune"]).label, "Gurugram +2")
})

test("nothing saved is unscoped, and names no city", () => {
  const scope = feedScope([])
  assert.equal(scope, EMPTY_FEED_SCOPE) // stable reference — safe in dep arrays
  assert.equal(scope.city, null)
  assert.equal(scope.isEmpty, true)
  assert.equal(scope.label, "All locations")
  assert.equal(feedScope(["  ", ""]).city, null)
  assert.equal(feedScope(undefined).city, null)
})

test("signature ignores order, case and whitespace; the city does not", () => {
  assert.equal(
    feedScope([" Gurugram ", "India (All)"]).signature,
    feedScope(["india (all)", "Gurugram"]).signature,
  )
  assert.equal(feedScope(["Gurugram", "Kochi"]).city, "Gurugram")
  assert.equal(feedScope(["Kochi", "Gurugram"]).city, "Kochi")
})
