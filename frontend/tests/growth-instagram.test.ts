import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { MAX_CAPTION_CHARS, orderSlides, singleCaptionFrom } from "../lib/growth/instagram"

test("per-slide captions fold into one caption, in slide order, without labels", () => {
  const draft = "Slide 1:\nFirst section.\n\nSlide 2:\nSecond section.\n\nTailor your CV. Link in bio."
  assert.equal(
    singleCaptionFrom(draft),
    "First section.\n\nSecond section.\n\nTailor your CV. Link in bio.",
  )
})

test("a draft written as one caption comes back as it is", () => {
  assert.equal(singleCaptionFrom("  One caption.\nFull issue: himyro.com/newsletter  "), "One caption.\nFull issue: himyro.com/newsletter")
})

test("issue 25's eight captions fit Instagram's caption limit as one", () => {
  const kit = readFileSync(
    new URL("../../scripts/newsletter-carousel-specs/issue-025-distribution.md", import.meta.url),
    "utf8",
  )
  const section = kit.slice(kit.indexOf("Slide 1:"), kit.indexOf("First comment:"))
  const caption = singleCaptionFrom(section.replace(/^(Slide \d+:)\n\n/gm, "$1\n"))
  assert.ok(caption.startsWith("If you want risk work in India"))
  assert.ok(caption.endsWith("Link in bio."))
  assert.ok(caption.length <= MAX_CAPTION_CHARS, `${caption.length} characters`)
})

test("slides upload in the order the builder numbered them", () => {
  const names = ["issue-025-slide-10.png", "issue-025-slide-02.png", "issue-025-slide-01.png"]
  assert.deepEqual(
    orderSlides(names.map((name) => ({ name }))).map((file) => file.name),
    ["issue-025-slide-01.png", "issue-025-slide-02.png", "issue-025-slide-10.png"],
  )
})
