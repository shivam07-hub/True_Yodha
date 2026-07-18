import test from "node:test"
import assert from "node:assert/strict"

import { resolveApplyTarget, careersSearchUrl } from "../lib/jobs/apply-transport"

test("resolveApplyTarget: portal link wins when present", () => {
  const t = resolveApplyTarget({ source_url: "https://jobs.example.com/x", company: "Acme" })
  assert.equal(t.kind, "direct")
  assert.equal(t.url, "https://jobs.example.com/x")
  assert.equal(t.company, "Acme")
  assert.equal(t.actionLabel, "Apply")
  assert.equal(t.destinationType, "direct_role")
})

test("resolveApplyTarget: known unhealthy role links become discovery, never Apply", () => {
  for (const listing_confidence of ["uncertain", "likely_closed", "closed"] as const) {
    const target = resolveApplyTarget({
      source_url: "https://jobs.example.com/stale-role",
      company: "Acme",
      listing_confidence,
    })
    assert.equal(target.kind, "discovery")
    assert.equal(target.actionLabel, "Find official opening")
    assert.equal(target.destinationType, "career_search")
  }
})

test("resolveApplyTarget: falls back to a company careers search (no /companies drift)", () => {
  const t = resolveApplyTarget({ source_url: null, company: "Airbnb" })
  assert.equal(t.kind, "discovery")
  assert.equal(t.url, careersSearchUrl("Airbnb"))
  assert.equal(t.actionLabel, "Find official opening")
  assert.equal(t.destinationType, "career_search")
  assert.match(t.url!, /google\.com\/search/)
  assert.match(t.url!, /Airbnb%20careers/)
})

test("resolveApplyTarget: blank/whitespace source_url is ignored", () => {
  const t = resolveApplyTarget({ source_url: "   ", company: "Acme" })
  assert.equal(t.kind, "discovery")
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
