import test from "node:test"
import assert from "node:assert/strict"

import {
  IDEAL_CV_SPEC,
  estimateLines,
  pageFillFromLines,
  pageFillBand,
  computeFill,
} from "../lib/cv/page-fill"
import { itemId } from "../lib/cv-compose"
import type { CVStructured } from "../lib/api"

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


// ── computeFill — ONE definition, over the WHOLE document ────────────────────
// The signed-in workstation and the public preview each used to carry their own
// copy. They diverged: the signed-in one counted identity + summary + experience
// + skills and NOTHING else, so a populated projects section was invisible to the
// meter that gates that user's download. These tests exist so the single
// definition cannot quietly lose a section again.

const bare: CVStructured = {
  contact: {
    name: "A", title: "", email: "", phone: "", location: "", linkedin: "",
  },
  summary: null,
  experience: [],
  projects: [],
  education: [],
  skills_line: null,
  certs: [],
}

const withRole = (): CVStructured => ({
  ...bare,
  experience: [{ role: "PM", company: "Co", location: "", dates: "2020", bullets: ["Cut cost 20%"] }],
})

test("computeFill: an empty CV is just the contact header", () => {
  assert.equal(computeFill(bare, new Set()).ratio * IDEAL_CV_SPEC.lineBudget, 3)
})

test("computeFill: a projects section is COUNTED (the signed-in meter's old blind spot)", () => {
  const cv = withRole()
  const before = computeFill(cv, new Set())
  const after = computeFill(
    { ...cv, projects: [{ name: "Myro", dates: "2026", bullets: ["Zero to 862 users"] }] },
    new Set(),
  )
  assert.ok(after.ratio > before.ratio, "adding a project must raise the fill")
})

test("computeFill: education and certifications are COUNTED", () => {
  const cv = withRole()
  const before = computeFill(cv, new Set())
  const withEdu = computeFill(
    { ...cv, education: [{ institution: "IIM", degree: "MBA", grade: "", dates: "2024", location: "" }] },
    new Set(),
  )
  const withCerts = computeFill({ ...cv, certs: ["AWS"] }, new Set())
  assert.ok(withEdu.ratio > before.ratio, "education must raise the fill")
  assert.ok(withCerts.ratio > before.ratio, "certifications must raise the fill")
})

test("computeFill: hiding a bullet lowers the fill", () => {
  const cv = withRole()
  const shown = computeFill(cv, new Set())
  const hidden = computeFill(cv, new Set([itemId("exp_bullet", 0, "Cut cost 20%")]))
  assert.ok(hidden.ratio < shown.ratio, "a hidden bullet must not be counted")
})

test("computeFill: identical CV and hidden set give one verdict for every surface", () => {
  const cv: CVStructured = {
    ...withRole(),
    projects: [{ name: "Myro", dates: "2026", bullets: ["Zero to 862 users"] }],
    education: [{ institution: "IIM", degree: "MBA", grade: "", dates: "2024", location: "" }],
    skills_line: "Product, SQL",
    certs: ["AWS"],
  }
  const hidden = new Set<string>()
  assert.deepEqual(computeFill(cv, hidden), computeFill(cv, hidden))
})
