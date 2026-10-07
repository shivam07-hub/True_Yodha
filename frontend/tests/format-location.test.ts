import test from "node:test"
import assert from "node:assert/strict"

import { formatJobLocation } from "../lib/format-location"

test("joins distinct city and country", () => {
  assert.equal(formatJobLocation({ city: "Bengaluru", country: "India" }), "Bengaluru, India")
})

test("a city equal to its country is no city (the 'India, India' bug)", () => {
  assert.equal(formatJobLocation({ city: "India", country: "India" }), "India — city not specified")
  assert.equal(formatJobLocation({ city: "india", country: "India" }), "India — city not specified")
})

test("keeps the scraper's no-city label", () => {
  assert.equal(
    formatJobLocation({ location: "Maharashtra — city not specified", city: null, country: "India" }),
    "Maharashtra — city not specified",
  )
})

test("explicit location wins over city/country", () => {
  assert.equal(
    formatJobLocation({ location: "Remote — EU", city: "Berlin", country: "Germany" }),
    "Remote — EU",
  )
})

test("normalises a duplicated explicit location string", () => {
  assert.equal(formatJobLocation({ location: "India, India" }), "India")
})

test("falls back through to whichever single part exists", () => {
  assert.equal(formatJobLocation({ city: "", country: "India" }), "India — city not specified")
  assert.equal(formatJobLocation({ city: "Pune", country: null }), "Pune")
})

test("returns null when nothing usable", () => {
  assert.equal(formatJobLocation({}), null)
  assert.equal(formatJobLocation({ city: "  ", country: null, location: "" }), null)
})
