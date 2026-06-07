import test from "node:test"
import assert from "node:assert/strict"

import { formatJobLocation } from "../lib/format-location"

test("joins distinct city and country", () => {
  assert.equal(formatJobLocation({ city: "Bengaluru", country: "India" }), "Bengaluru, India")
})

test("de-dupes city equal to country (the 'India, India' bug)", () => {
  assert.equal(formatJobLocation({ city: "India", country: "India" }), "India")
})

test("de-dupes case-insensitively", () => {
  assert.equal(formatJobLocation({ city: "india", country: "India" }), "india")
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
  assert.equal(formatJobLocation({ city: "", country: "India" }), "India")
  assert.equal(formatJobLocation({ city: "Pune", country: null }), "Pune")
})

test("returns null when nothing usable", () => {
  assert.equal(formatJobLocation({}), null)
  assert.equal(formatJobLocation({ city: "  ", country: null, location: "" }), null)
})
