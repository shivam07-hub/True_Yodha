import test from "node:test"
import assert from "node:assert/strict"

import { resolveApplyTarget, careersSearchUrl } from "../lib/jobs/apply-transport"

test("resolveApplyTarget: portal link wins when present", () => {
  const t = resolveApplyTarget({ source_url: "https://jobs.example.com/x", company: "Acme" })
  assert.equal(t.kind, "portal")
  assert.equal(t.url, "https://jobs.example.com/x")
  assert.equal(t.company, "Acme")
})

test("resolveApplyTarget: falls back to a company careers search (no /companies drift)", () => {
  const t = resolveApplyTarget({ source_url: null, company: "Airbnb" })
  assert.equal(t.kind, "careers")
  assert.equal(t.url, careersSearchUrl("Airbnb"))
  assert.match(t.url!, /google\.com\/search/)
  assert.match(t.url!, /Airbnb%20careers/)
})

test("resolveApplyTarget: blank/whitespace source_url is ignored", () => {
  const t = resolveApplyTarget({ source_url: "   ", company: "Acme" })
  assert.equal(t.kind, "careers")
})

test("resolveApplyTarget: no link and no company yields none", () => {
  const t = resolveApplyTarget({ source_url: null, company: null })
  assert.equal(t.kind, "none")
  assert.equal(t.url, null)
})

test("careersSearchUrl: null/blank company yields null", () => {
  assert.equal(careersSearchUrl(null), null)
  assert.equal(careersSearchUrl("   "), null)
  assert.equal(careersSearchUrl(undefined), null)
})
