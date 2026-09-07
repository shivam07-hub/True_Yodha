import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const RAW = readFileSync("components/onboarding/target-steps.tsx", "utf8")
/** Prose stripped: this file explains the very behaviour these tests assert. */
const STEPS = RAW.split("\n").filter((l) => !/^\s*(\*|\/\/|\{\/\*)/.test(l)).join("\n")

test("search is always visible, never behind a disclosure", () => {
  // Of the 14 most recent people who finished Direction, SEVEN chose a family
  // that was not suggested to them. Search was the only way they got there,
  // and it was a muted underlined link below the cards.
  assert.ok(!STEPS.includes("showSearch ? ("), "the input must not be conditional")
  assert.match(STEPS, /Not listed\? Search any role/)
})

test("typing enables the query without a separate click", () => {
  assert.match(STEPS, /onShowSearch\(true\)/)
})

test("the suggestion list is no longer three", () => {
  const repo = readFileSync("../backend/app/repositories/role_families.py", "utf8")
  assert.match(repo, /limit: int = 6/)
})

test("the empty state still points at search", () => {
  assert.match(STEPS, /Search the roles Myro is currently tracking/)
})
