import test from "node:test"
import assert from "node:assert/strict"

import { displayJobTitle, isJunkTitle, TITLE_UNAVAILABLE } from "../lib/jobs/clean-title"

/** Every string here was seen in production on 2026-07-26. */
test("catches the junk titles observed live", () => {
  assert.equal(isJunkTitle("Cognizant", "Cognizant"), true, "company repeated as title")
  assert.equal(isJunkTitle("cognizant", "Cognizant "), true, "case/space insensitive")
  assert.equal(isJunkTitle("Apply now about Security Clearance Jobs"), true)
  assert.equal(isJunkTitle("Accelerate Your Hiring Process"), true)
  assert.equal(isJunkTitle("Job ID: 4419341255"), true)
  assert.equal(
    isJunkTitle("Consulting  ### Location:IndiaEmployment Type:Full time"), true,
    "markdown + key:value scraper debris",
  )
  assert.equal(isJunkTitle(""), true)
  assert.equal(isJunkTitle(null), true)
  assert.equal(isJunkTitle("   "), true)
  assert.equal(isJunkTitle("12345"), true)
})

/**
 * The expensive failure mode is the FALSE POSITIVE — hiding a real title is
 * worse than showing an odd one, so these must all survive.
 */
test("never eats a real title", () => {
  const real = [
    "Senior Product Manager",
    "Machine Learning Engineering Intern (PhD)",
    "Sr. Data Engineer-HANA",
    "Head of Internal Stakeholder Communications",
    "Manager - Data & Product Analytics",
    "Multi-Cloud Sales Specialist",
    "GTM Business Development Manager",
    "Software Development Engineer II",
    "Consultant",                       // short, but a genuine role
    "Manager, Sales Strategy & Transformation",
    "Head of Careers",                  // contains "careers", not "Careers at X"
    "Job Architect",                    // starts with "Job", not "Job ID"
    "Applications Engineer",            // starts with "Appl", not "Apply now"
  ]
  for (const t of real) {
    assert.equal(isJunkTitle(t), false, `should keep: ${t}`)
    assert.equal(displayJobTitle(t), t)
  }
})

test("a real title matching its own company is only junk when it IS the company", () => {
  // "Cognizant" at Cognizant = junk. A real role at Cognizant = fine.
  assert.equal(isJunkTitle("Data Engineer", "Cognizant"), false)
  assert.equal(isJunkTitle("Cognizant", "Infosys"), false, "no company match -> not junk by that rule")
})

test("displayJobTitle collapses extraction whitespace and reports junk honestly", () => {
  assert.equal(displayJobTitle("Senior   Product\n Manager"), "Senior Product Manager")
  assert.equal(displayJobTitle("Cognizant", "Cognizant"), TITLE_UNAVAILABLE)
  assert.equal(displayJobTitle(null), TITLE_UNAVAILABLE)
})
