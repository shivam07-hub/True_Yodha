/**
 * #56 S3c — the LinkedIn door (ENG3). Source contracts for what the card may
 * ask for and what it may offer.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const CARD = readFileSync("components/apply-pack/linkedin-check-card.tsx", "utf8")
const BLOCKS = readFileSync("components/apply-pack/linkedin-blocks.tsx", "utf8")
const DESK = readFileSync("components/cv/builder/library-view.tsx", "utf8")
const PHONE = readFileSync("components/cv/mobile/mobile-cv-hub.tsx", "utf8")

test("the card asks for a profile URL and WhatsApp, never a LinkedIn login", () => {
  assert.match(CARD, /LinkedIn URL/)
  assert.match(CARD, /WhatsApp/)
  assert.doesNotMatch(CARD, /type="password"|password/i)
})

test("a held check is spent before coins or money are asked for", () => {
  const form = CARD.split("const held = heldCheck(checks)")[1]
  const ret = form.split("return (")[1]
  assert.ok(ret.indexOf("Use your human check") < ret.indexOf("Rewrite for"))
  assert.ok(ret.indexOf("Rewrite for") < ret.indexOf("<ApplyPackBuy"))
  assert.match(ret, /<SaleOffer>\s*<ApplyPackBuy \/>/)
})

test("the coin button only renders when the balance covers it", () => {
  assert.match(CARD, /coins !== null && balance >= coins \?/)
})

test("a delivered rewrite is copied section by section and links their own profile", () => {
  assert.match(BLOCKS, /navigator\.clipboard\.writeText/)
  for (const label of ["Headline", "About", "Education", "Top skills", "Featured", "Delete these rows"]) {
    assert.ok(BLOCKS.includes(label), label)
  }
  assert.match(BLOCKS, /Open your LinkedIn/)
})

test("both CV surfaces carry the door", () => {
  assert.match(DESK, /<LinkedInCheckCard token=\{token\} \/>/)
  assert.match(PHONE, /<LinkedInCheckCard token=\{token\} \/>/)
})
