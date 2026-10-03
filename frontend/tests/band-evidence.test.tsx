/**
 * The Field card's evidence line. It carries a denominator because names alone
 * made a field matching 2 CV skills look as strong as one matching 18, and it
 * says nothing at all when there is no CV — "none of yours" about a CV Myro
 * never read would be a claim, not a finding.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { renderToStaticMarkup } from "react-dom/server"

import { BandChoice, bandEvidence } from "../components/target-role/band-choice"
import type { CareerBandOption } from "../lib/api"

const base: CareerBandOption = {
  band: "business_product_operations", job_count: 20659, family_count: 154, fit: 24.3,
}

test("a match reads as a count with its denominator, then the names", () => {
  assert.equal(
    bandEvidence({ ...base, cv_skill_count: 34, matched_count: 18, matched_skills: ["Leadership", "Stakeholder Management", "Consulting"] }),
    "18 of your 34 skills asked here · Leadership, Stakeholder Management, Consulting",
  )
})

test("nothing asked is said, because it was measured", () => {
  assert.equal(
    bandEvidence({ ...base, cv_skill_count: 34, matched_count: 0, matched_skills: [] }),
    "None of your 34 skills asked here yet",
  )
})

test("no CV says nothing — unknown is not zero", () => {
  assert.equal(bandEvidence({ ...base, cv_skill_count: null, matched_count: null, matched_skills: null }), null)
  assert.equal(bandEvidence(base), null)
})

test("the card counts kinds of work, the noun the next screen uses", () => {
  const html = renderToStaticMarkup(
    <BandChoice options={[{ ...base, cv_skill_count: 34, matched_count: 18, matched_skills: ["Leadership"] }]} selected={[]} onChange={() => {}} />,
  )
  assert.match(html, /154 kinds of work/)
  assert.match(html, /18 of your 34 skills asked here · Leadership/)
  assert.doesNotMatch(html, /directions/)
})
