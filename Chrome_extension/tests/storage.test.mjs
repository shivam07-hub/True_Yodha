import test from "node:test"
import assert from "node:assert/strict"
import { jobUrlKey } from "../src/storage.js"

test("hash and trailing slash collapse to one key", () => {
  const a = jobUrlKey("https://jobs.ashbyhq.com/openai/123/")
  const b = jobUrlKey("https://jobs.ashbyhq.com/openai/123#apply")
  assert.equal(a, b)
})

test("query string is preserved (ATS job id lives there)", () => {
  const a = jobUrlKey("https://boards.greenhouse.io/acme/jobs?gh_jid=42")
  const b = jobUrlKey("https://boards.greenhouse.io/acme/jobs?gh_jid=99")
  assert.notEqual(a, b)
})

test("empty / malformed input never throws", () => {
  assert.equal(jobUrlKey(""), "")
  assert.equal(jobUrlKey("not a url#frag"), "not a url")
})
