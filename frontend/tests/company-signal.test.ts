import { test } from "node:test"
import assert from "node:assert/strict"
import { companyInitials } from "../lib/companies/company-initials"

test("two-word company → first letter of each word, uppercased", () => {
  assert.equal(companyInitials("Deloitte India"), "DI")
})

test("single word → first two letters", () => {
  assert.equal(companyInitials("Accenture"), "AC")
})

test("three+ words → first two words only", () => {
  assert.equal(companyInitials("Tata Consultancy Services"), "TC")
})

test("empty / whitespace name falls back to CO", () => {
  assert.equal(companyInitials("   "), "CO")
  assert.equal(companyInitials(""), "CO")
})
