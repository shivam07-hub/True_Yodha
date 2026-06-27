import test from "node:test"
import assert from "node:assert/strict"

import {
  buildIntelSearchHref,
  getJobSearchExamples,
  initialJobSearchValue,
} from "../components/public/job-search-console-model"

test("job search submit routes through the public intel surface", () => {
  assert.equal(
    buildIntelSearchHref("  product roles in Bangalore  "),
    "/intel?search=product+roles+in+Bangalore",
  )
})

test("blank job search submit keeps the visitor on the public intel surface", () => {
  assert.equal(buildIntelSearchHref("   "), "/intel")
})

test("intel search hydrates from the shared search parameter", () => {
  assert.equal(
    initialJobSearchValue(new URLSearchParams("search=remote+data+analyst")),
    "remote data analyst",
  )
})

test("shared examples preserve the landing search prompts", () => {
  assert.deepEqual(getJobSearchExamples(), [
    "Product roles in Bangalore",
    "Remote data analyst jobs",
    "Frontend engineer, Pune",
  ])
})
