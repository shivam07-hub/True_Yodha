import test from "node:test"
import assert from "node:assert/strict"

import { duplicateTitleKeys, titleKey } from "../lib/cv/cv-list"

test("two postings with the same company and title are marked, a unique one is not", () => {
  const rows = [
    { company: "Microsoft", title: "Partner Solution Sales" },
    { company: "Microsoft", title: "Partner Solution Sales" },
    { company: "PwC", title: "Manager" },
  ]
  const duplicates = duplicateTitleKeys(rows)
  assert.equal(duplicates.has(titleKey("Microsoft", "Partner Solution Sales")), true)
  assert.equal(duplicates.has(titleKey("PwC", "Manager")), false)
})

test("company and title compare without case or surrounding space", () => {
  const duplicates = duplicateTitleKeys([
    { company: " Microsoft ", title: "Partner Solution Sales" },
    { company: "microsoft", title: "partner solution sales" },
  ])
  assert.equal(duplicates.size, 1)
})
