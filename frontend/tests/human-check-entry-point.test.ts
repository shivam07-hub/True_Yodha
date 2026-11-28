import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const LINE = readFileSync("components/apply-pack/human-check-line.tsx", "utf8")
const ROOM = readFileSync("components/preparations/prep-room.tsx", "utf8")

test("the Human Check sits beside the CV that was actually sent", () => {
  // "Is this CV right for this job" is asked right after applying, never on a
  // pricing page. The line lives in the On record section, after Applied.
  const record = ROOM.split('aria-label="On record"')[1]
  // The record line states the check; the room sells it in the card under the
  // steps (ONE_PREP P3), so the line never offers a second buy button.
  assert.ok(record.includes("<HumanCheckLine token={token} jobId={app.job_id} offer={false} />"))
  assert.ok(record.indexOf("Applied") < record.indexOf("<HumanCheckLine"))
})

test("the room sells the check under its steps, about this job (ONE_PREP P3)", () => {
  const steps = ROOM.indexOf('<div className="prp-steps">')
  const offer = ROOM.indexOf('<PackOffer token={token} surface="room" jobId={app.job_id} />')
  assert.ok(steps > 0 && offer > steps, "the offer sits after the four steps")
  assert.ok(offer < ROOM.indexOf('aria-label="On record"'))
})

test("a line told not to offer still states a check, and never sells", () => {
  const afterStates = LINE.split("if (!offer) return null")
  assert.equal(afterStates.length, 2)
  assert.match(afterStates[0], /Checked by/)
  assert.match(afterStates[0], /Human check · due/)
  assert.ok(!afterStates[0].includes("<ApplyPackBuy"))
})

test("a closed application is not sold to", () => {
  const record = ROOM.split('aria-label="On record"')[1]
  assert.match(record, /stage !== "closed" && checkForJob \? \(/)
})

test("nothing is offered until the checks are known", () => {
  assert.match(LINE, /if \(checksQ\.isLoading\) return null/)
})

test("a check on this job shows its state, never the price", () => {
  const owned = LINE.split("if (checksQ.isLoading) return null")[1].split("const held = heldCheck(checks)")[0]
  assert.match(owned, /Checked by/)
  assert.match(owned, /Human check · due/)
  assert.ok(!owned.includes("ApplyPackBuy"))
})

test("a held check is spent before anything is sold, and the sale is a SaleOffer", () => {
  const rest = LINE.split("const held = heldCheck(checks)")[1]
  assert.ok(rest.indexOf("Use your human check") < rest.indexOf("<ApplyPackBuy"))
  assert.match(rest, /<SaleOffer>/)
})
