import test from "node:test"
import assert from "node:assert/strict"

import {
  IDEAL_CV_SPEC,
  estimateLines,
  pageFillFromLines,
  pageFillBand,
} from "../lib/cv/page-fill"

test("estimateLines: empty/whitespace costs zero lines", () => {
  assert.equal(estimateLines(""), 0)
  assert.equal(estimateLines("   "), 0)
  assert.equal(estimateLines(null), 0)
  assert.equal(estimateLines(undefined), 0)
})

test("estimateLines: short text is one line, long text wraps", () => {
  assert.equal(estimateLines("Led a team"), 1)
  // 98 chars per line by default → 120 chars wraps to 2 lines.
  assert.equal(estimateLines("x".repeat(98)), 1)
  assert.equal(estimateLines("x".repeat(99)), 2)
  assert.equal(estimateLines("x".repeat(196)), 2)
  assert.equal(estimateLines("x".repeat(197)), 3)
})

test("estimateLines: honours a custom chars-per-line", () => {
  assert.equal(estimateLines("x".repeat(40), 20), 2)
})

test("pageFillFromLines: under budget fits on one page", () => {
  const f = pageFillFromLines(25)
  assert.equal(f.fits, true)
  assert.equal(f.pages, 1)
  assert.equal(f.pct, 50)
  assert.equal(pageFillBand(f), "ok")
})

test("pageFillFromLines: exactly the budget still fits", () => {
  const f = pageFillFromLines(IDEAL_CV_SPEC.lineBudget)
  assert.equal(f.fits, true)
  assert.equal(f.pages, 1)
  assert.equal(f.pct, 100)
})

test("pageFillFromLines: just over budget spills to two pages", () => {
  const f = pageFillFromLines(IDEAL_CV_SPEC.lineBudget + 1)
  assert.equal(f.fits, false)
  assert.equal(f.pages, 2)
  assert.equal(pageFillBand(f), "tight")
})

test("pageFillFromLines: well over budget is the 'over' band", () => {
  const f = pageFillFromLines(IDEAL_CV_SPEC.lineBudget * 1.4)
  assert.equal(f.fits, false)
  assert.equal(pageFillBand(f), "over")
  assert.equal(f.pct, 140)
})

test("pageFillFromLines: zero/negative lines is an empty page", () => {
  assert.deepEqual(pageFillFromLines(0), { ratio: 0, pct: 0, pages: 1, fits: true })
  assert.equal(pageFillFromLines(-5).fits, true)
})
