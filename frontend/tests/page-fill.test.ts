import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  PAGE_SLACK_PX,
  PDF_PAGE_MM,
  hasHideableBullets,
  measurePageFill,
  bulletsToHide,
  pageFillBand,
  pageFillFromHeight,
  pdfContentBox,
  selectBulletsToHide,
} from "../lib/cv/page-fill"
import { itemId } from "../lib/cv-compose"
import type { CVStructured } from "../lib/api"

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8")

const page = pdfContentBox().height

test("the export box is A4 minus the 14mm margin Chromium applies", () => {
  const pxPerMm = 96 / 25.4
  assert.equal(PDF_PAGE_MM.margin, 14)
  assert.equal(pdfContentBox().width, (210 - 28) * pxPerMm)
  assert.equal(pdfContentBox().height, (297 - 28) * pxPerMm)
  const pdf = read("../../backend/app/services/cv_pdf_html.py")
  assert.match(pdf, /format="A4"/)
  assert.match(pdf, /"top": "14mm"/)
  assert.match(pdf, /padding: 0 !important/)
  assert.match(pdf, /\.cvb-pdf-page \.pdf-foot \{ display: none !important; \}/)
  const printCss = read("../app/(authed)/cv/cv-builder.css")
  assert.match(printCss, /@page \{ size: A4; margin: 14mm; \}/)
})

test("a CV at 97% of one page fits and is one page", () => {
  const fill = pageFillFromHeight(page * 0.97)
  assert.equal(fill.measured, true)
  assert.equal(fill.fits, true)
  assert.equal(fill.pages, 1)
  assert.equal(fill.pct, 97)
  assert.equal(pageFillBand(fill), "tight")
})

test("exactly one page, including the rounding slack, still fits", () => {
  const exact = pageFillFromHeight(page)
  assert.equal(exact.fits, true)
  assert.equal(exact.pages, 1)
  assert.equal(exact.pct, 100)
  const slack = pageFillFromHeight(page + PAGE_SLACK_PX)
  assert.equal(slack.fits, true)
  assert.equal(slack.pages, 1)
})

test("a hair past one page is two pages and still a legal download", () => {
  const fill = pageFillFromHeight(page + PAGE_SLACK_PX + 0.1)
  assert.equal(fill.fits, false)
  assert.equal(fill.pages, 2)
  assert.equal(pageFillBand(fill), "tight")
  // fits is a fact. Nothing in this module refuses a download.
  assert.equal(typeof fill.fits, "boolean")
})

test("exactly two pages stays two; a hair past that is three", () => {
  const two = pageFillFromHeight(page * 2)
  assert.equal(two.pages, 2)
  assert.equal(two.fits, false)
  assert.equal(two.pct, 200)
  assert.equal(pageFillBand(two), "over")
  assert.equal(pageFillFromHeight(page * 2 + PAGE_SLACK_PX + 0.1).pages, 3)
})

test("a short CV is one page and not a tight page", () => {
  const fill = pageFillFromHeight(page * 0.5)
  assert.equal(fill.fits, true)
  assert.equal(fill.pages, 1)
  assert.equal(fill.pct, 50)
  assert.equal(pageFillBand(fill), "ok")
})

test("an unmeasured sheet does not pretend to spill, so a download is not blocked", () => {
  for (const height of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const fill = pageFillFromHeight(height)
    assert.equal(fill.measured, false)
    assert.equal(fill.fits, true)
    assert.equal(fill.pages, 1)
    assert.equal(fill.pct, 0)
  }
  assert.equal(pageFillFromHeight(400, 0).measured, false)
  assert.equal(pageFillFromHeight(400, Number.NaN).measured, false)
  assert.equal(measurePageFill(null).measured, false)
  assert.deepEqual(bulletsToHide(null), [])
})

test("fit hides the longest bullet first and stops once the page fits", () => {
  const pageHeight = 1000
  const bullets = [
    { id: "exp_bullet:short", textLength: 10, index: 0 },
    { id: "exp_bullet:long", textLength: 80, index: 1 },
    { id: "proj_bullet:mid", textLength: 40, index: 2 },
  ]
  // 1200 until the longest is hidden, then 900.
  const heightWith = (hidden: ReadonlySet<string>) => hidden.has("exp_bullet:long") ? 900 : 1200
  assert.deepEqual(selectBulletsToHide(bullets, heightWith, pageHeight), ["exp_bullet:long"])
})

test("fit keeps hiding until the measured height fits, including a project bullet", () => {
  const pageHeight = 1000
  const bullets = [
    { id: "exp_bullet:a", textLength: 50, index: 0 },
    { id: "proj_bullet:b", textLength: 90, index: 1 },
    { id: "exp_bullet:c", textLength: 70, index: 2 },
  ]
  const heightWith = (hidden: ReadonlySet<string>) => 1500 - hidden.size * 200
  assert.deepEqual(
    selectBulletsToHide(bullets, heightWith, pageHeight),
    ["proj_bullet:b", "exp_bullet:c", "exp_bullet:a"],
  )
})

test("a bullet that does not shorten the page is left on the CV", () => {
  const pageHeight = 1000
  const bullets = [
    { id: "stuck", textLength: 100, index: 0 },
    { id: "useful", textLength: 40, index: 1 },
  ]
  const heightWith = (hidden: ReadonlySet<string>) => hidden.has("useful") ? 800 : 1300
  assert.deepEqual(selectBulletsToHide(bullets, heightWith, pageHeight), ["useful"])
})

test("a length tie hides the later bullet", () => {
  const bullets = [
    { id: "first", textLength: 20, index: 0 },
    { id: "later", textLength: 20, index: 4 },
  ]
  const heightWith = (hidden: ReadonlySet<string>) => hidden.has("later") ? 100 : 5000
  assert.deepEqual(selectBulletsToHide(bullets, heightWith, 1000), ["later"])
})

test("already one page hides nothing, and a page that cannot shrink hides nothing", () => {
  const bullets = [{ id: "a", textLength: 10, index: 0 }]
  assert.deepEqual(selectBulletsToHide(bullets, () => 500, 1000), [])
  assert.deepEqual(selectBulletsToHide(bullets, () => 5000, 1000), [])
  assert.deepEqual(selectBulletsToHide(bullets, () => Number.NaN, 1000), [])
  assert.deepEqual(selectBulletsToHide([], () => 5000, 1000), [])
  assert.deepEqual(selectBulletsToHide(bullets, () => 5000, 0), [])
})

test("hideable bullets include projects and ignore a bullet already hidden", () => {
  const cv: CVStructured = {
    summary: null,
    education: [],
    experience: [{ company: "A", role: "R", dates: "", location: "", bullets: ["Kept", "Gone"] }],
    projects: [{ name: "P", dates: "", bullets: ["Built it"] }],
    skills_line: null,
    certs: [],
  }
  assert.equal(hasHideableBullets(cv, new Set()), true)
  const hidden = new Set([
    itemId("exp_bullet", 0, "Kept"),
    itemId("exp_bullet", 1, "Gone"),
    itemId("proj_bullet", 0, "Built it"),
  ])
  assert.equal(hasHideableBullets(cv, hidden), false)
  assert.equal(hasHideableBullets({ ...cv, experience: [], projects: [] }, new Set()), false)
})

test("the character model is gone, and download is not gated on the meter", () => {
  const meter = read("../lib/cv/page-fill.ts")
  assert.doesNotMatch(meter, /charsPerLine|lineBudget|computeFill|estimateLines/)
  const playground = read("../components/cv/builder/playground-view.tsx")
  assert.doesNotMatch(playground, /if \(.*pageFill\.fits\)/)
  assert.match(playground, /void downloadInPlace\(chosen\)/)
  const trim = read("../components/cv/builder/trim-confirm.tsx")
  assert.doesNotMatch(trim, /estimateLines|Download anyway|charsPerLine/)
  assert.match(trim, /bulletsToHide/)
})
