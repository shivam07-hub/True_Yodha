import test from "node:test"
import assert from "node:assert/strict"

import {
  catalogFromAnalytics,
  locationMatches,
  suggestLocations,
} from "../lib/location-catalog"

test("Gurgaon finds Gurugram and Bangalore finds Bengaluru", () => {
  assert.equal(locationMatches("Gurugram", "Gurgaon"), true)
  assert.equal(locationMatches("Gurugram", "gurga"), true)
  assert.equal(locationMatches("Bengaluru", "Bangalore"), true)
  assert.equal(locationMatches("Bengaluru", "bang"), true)
  assert.equal(locationMatches("Pune", "Gurgaon"), false)
})

test("Delhi aliases land on Delhi NCR", () => {
  assert.equal(locationMatches("Delhi NCR", "delhi"), true)
  assert.equal(locationMatches("Delhi NCR", "New Delhi"), true)
  assert.equal(locationMatches("Delhi NCR", "ncr"), true)
})

test("catalog drops unknown, prefers cities, sorts by live count", () => {
  const catalog = catalogFromAnalytics({
    by_location_city: [
      { name: "Pune", count: 12 },
      { name: " unknown ", count: 99 },
      { name: "Gurugram", count: 40 },
    ],
    by_location_country: [
      { name: "India", count: 80 },
      { name: "Pune", count: 3 },
    ],
  })
  assert.deepEqual(
    catalog.map((e) => e.name),
    ["Gurugram", "Pune", "India"],
  )
  assert.equal(catalog.find((e) => e.name === "Pune")?.count, 12)
})

test("suggestions exclude chosen, prepend extras, honour aliases", () => {
  const catalog = [
    { name: "Bengaluru", count: 50 },
    { name: "Gurugram", count: 40 },
    { name: "Pune", count: 12 },
  ]
  const hit = suggestLocations({
    catalog,
    query: "Gurgaon",
    chosen: ["Bengaluru"],
    extras: ["Remote"],
  })
  assert.deepEqual(hit.map((e) => e.name), ["Gurugram"])

  const idle = suggestLocations({
    catalog,
    query: "",
    chosen: ["Bengaluru"],
    extras: ["Remote"],
    limit: 3,
  })
  assert.deepEqual(idle.map((e) => e.name), ["Remote", "Gurugram", "Pune"])
})
