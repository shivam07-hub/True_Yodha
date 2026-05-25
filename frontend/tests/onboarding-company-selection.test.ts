import test from "node:test"
import assert from "node:assert/strict"

import {
  companyInitials,
  companyKey,
  followedRowsToNames,
  isCompanySelected,
  prependCompany,
  removeCompany,
  shouldSearchCompanies,
} from "../lib/onboarding-company-selection"

test("companyKey normalizes case and whitespace", () => {
  assert.equal(companyKey("  Google   India "), "google india")
})

test("shouldSearchCompanies waits for two meaningful characters", () => {
  assert.equal(shouldSearchCompanies(" g "), false)
  assert.equal(shouldSearchCompanies(" go "), true)
})

test("companyInitials produces compact avatars", () => {
  assert.equal(companyInitials("Razorpay"), "RA")
  assert.equal(companyInitials("Wells Fargo"), "WF")
})

test("prependCompany keeps selection unique and capped", () => {
  const selected = prependCompany(["Google"], " google ", 3)
  assert.deepEqual(selected, ["Google"])

  const capped = prependCompany(["A", "B"], "C", 2)
  assert.deepEqual(capped, ["A", "B"])

  const next = prependCompany(["A"], "Cognizant", 3)
  assert.deepEqual(next, ["Cognizant", "A"])
})

test("removeCompany removes by normalized key", () => {
  assert.deepEqual(removeCompany(["Google India", "Razorpay"], " google   india "), ["Razorpay"])
})

test("followedRowsToNames dedupes backend rows without reordering", () => {
  const names = followedRowsToNames([
    { company_name: "Google" },
    { company_name: " google " },
    { company_name: "Razorpay" },
  ])

  assert.deepEqual(names, ["Google", "Razorpay"])
  assert.equal(isCompanySelected(names, "razorpay"), true)
})
