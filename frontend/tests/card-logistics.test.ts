import test from "node:test"
import assert from "node:assert/strict"

import {
  durationLabel,
  isFreshAge,
  isInternRole,
  listingVenueOf,
  logisticsOf,
  stipendLabel,
} from "../lib/jobs/card-logistics"

test("MNC strip is mode, pay, years — never a career band", () => {
  const items = logisticsOf({
    role: "Data Analyst",
    location: "Bengaluru",
    locationMode: "onsite",
    seniority: "mid",
    minYears: 2,
    maxYears: 4,
    pay: { label: "~₹12–18L", estimated: true, belowFloor: false },
  })
  assert.deepEqual(items.map((i) => `${i.kind}:${i.label}`), [
    "location:Bengaluru",
    "mode:On-site",
    "pay:~₹12–18L",
    "years:2–4 yrs",
  ])
})

test("intern strip is stipend, duration, PPO — not lakhs or years", () => {
  const items = logisticsOf({
    role: "Product intern",
    location: "Mumbai",
    locationMode: "hybrid",
    employmentKind: "internship",
    stipendLowInr: 5000,
    stipendHighInr: 10000,
    durationMonths: 3,
    ppo: true,
    minYears: 0,
    maxYears: 1,
    pay: { label: "~₹4–6L", estimated: true, belowFloor: false },
  })
  assert.deepEqual(items.map((i) => `${i.kind}:${i.label}`), [
    "location:Mumbai",
    "mode:Hybrid",
    "stipend:₹5–10K/mo",
    "duration:3 mo",
    "ppo:PPO",
  ])
})

test("null hunt facts drop out of the strip", () => {
  const items = logisticsOf({
    role: "Analyst",
    locationMode: "remote",
  })
  assert.deepEqual(items.map((i) => i.label), ["Remote"])
})

test("intern detection from title, seniority, stipend, or employment kind", () => {
  assert.equal(isInternRole({ role: "SDE Intern" }), true)
  assert.equal(isInternRole({ role: "Analyst", seniority: "intern" }), true)
  assert.equal(isInternRole({ role: "Analyst", stipendLowInr: 8000 }), true)
  assert.equal(isInternRole({ role: "Analyst", employmentKind: "internship" }), true)
  assert.equal(isInternRole({ role: "Analyst" }), false)
})

test("stipend and duration labels compact the number", () => {
  assert.equal(stipendLabel(8000, 8000), "₹8K/mo")
  assert.equal(stipendLabel(500, 500), "₹500/mo")
  assert.equal(stipendLabel(null, null), null)
  assert.equal(durationLabel(1), "1 mo")
  assert.equal(durationLabel(6), "6 mo")
  assert.equal(durationLabel(null), null)
})

test("listing venue defaults to career_page", () => {
  assert.equal(listingVenueOf("myro"), "myro")
  assert.equal(listingVenueOf(null), "career_page")
  assert.equal(listingVenueOf("career_page"), "career_page")
})

test("today and 1d are the fresh age pill", () => {
  assert.equal(isFreshAge(new Date().toISOString()), true)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString()
  assert.equal(isFreshAge(yesterday), true)
  const week = new Date(Date.now() - 8 * 86_400_000).toISOString()
  assert.equal(isFreshAge(week), false)
  assert.equal(isFreshAge(null), false)
})
