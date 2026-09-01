import test from "node:test"
import assert from "node:assert/strict"

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import {
  FINLATICS_APPLY_LABEL,
  FINLATICS_BRAND_LABEL,
  FINLATICS_LOGO_SRC,
  FINLATICS_PROGRAMS,
  FINLATICS_SRC,
  finlaticsHomeHref,
  finlaticsHref,
} from "../lib/finlatics-programs"

test("the rail lists the eleven landing programs, Financial Analyst first", () => {
  assert.deepEqual(FINLATICS_PROGRAMS.map((program) => program.title), [
    "Financial Analyst",
    "Investment Banking",
    "Business Analyst & Data Science",
    "Full Stack Development",
    "Product Management with AI",
    "Derivative Markets",
    "Financial Markets",
    "Business Analyst with Excel",
    "Data Science & Machine Learning",
    "Market Research Analyst",
    "Machine Learning",
  ])
  assert.equal(FINLATICS_SRC, "myroref")
  assert.deepEqual(FINLATICS_PROGRAMS.map((program) => program.mark), [
    "FA", "IB", "BA", "FS", "PM", "DM", "FM", "EX", "DS", "MR", "ML",
  ])
  for (const program of FINLATICS_PROGRAMS) {
    assert.ok(program.blurb.length > 20, `${program.id} needs a program blurb`)
    assert.equal(program.blurb.includes("—"), false)
  }
  assert.equal(FINLATICS_APPLY_LABEL, "Apply on Finlatics")
  assert.equal(FINLATICS_BRAND_LABEL, "Training by Finlatics")
})

test("the landing rail logo is the committed Finlatics mark in /public/brand", () => {
  assert.equal(FINLATICS_LOGO_SRC, "/brand/finlatics.png")
  assert.ok(existsSync(join(process.cwd(), "public", "brand", "finlatics.png")))
})

test("Prep and landing render the same Training by Finlatics lockup", () => {
  const train = readFileSync(join(process.cwd(), "components/preparations/training-card.tsx"), "utf8")
  const landing = readFileSync(join(process.cwd(), "components/public/landing/finlatics-rail.tsx"), "utf8")
  assert.match(train, /FINLATICS_BRAND_LABEL/)
  assert.match(landing, /FINLATICS_BRAND_LABEL/)
  assert.doesNotMatch(train, /Training with/)
  assert.doesNotMatch(landing, /Training with/)
})

test("the Finlatics home footer carries the same Myro attribution", () => {
  const url = new URL(finlaticsHomeHref())
  assert.equal(url.origin, "https://www.finlatics.com")
  assert.equal(url.searchParams.get("utm_src"), "myroref")
})

test("every program opens Finlatics with the Myro attribution param", () => {
  for (const program of FINLATICS_PROGRAMS) {
    const href = finlaticsHref(program)
    const url = new URL(href)
    assert.equal(url.protocol, "https:")
    assert.equal(url.hostname, "www.finlatics.com")
    assert.equal(url.searchParams.get(program.attr), "myroref")
    assert.equal(url.searchParams.get("website"), null)
    assert.ok(!href.includes("website"))
  }
})

test("the Excel program uses src; the rest use utm_src — matching the landing page", () => {
  const excel = FINLATICS_PROGRAMS.find((program) => program.id === "da")
  assert.ok(excel)
  const excelUrl = new URL(finlaticsHref(excel))
  assert.equal(excel.attr, "src")
  assert.equal(excelUrl.searchParams.get("src"), "myroref")
  assert.equal(excelUrl.searchParams.get("utm_src"), null)

  const others = FINLATICS_PROGRAMS.filter((program) => program.id !== "da")
  assert.equal(others.length, 10)
  for (const program of others) {
    const url = new URL(finlaticsHref(program))
    assert.equal(program.attr, "utm_src")
    assert.equal(url.searchParams.get("utm_src"), "myroref")
    assert.equal(url.searchParams.get("src"), null)
  }
})
