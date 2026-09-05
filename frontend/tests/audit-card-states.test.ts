import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const CARD = readFileSync("components/preparations/audit-card.tsx", "utf8")
const ROOM = readFileSync("components/preparations/audit-room.tsx", "utf8")
const FORM = readFileSync("components/preparations/audit-intake-form.tsx", "utf8")

test("a full queue stops offering instead of failing on click", () => {
  // An offer that 409s after the user commits is worse than no offer. The card
  // and the room both branch on availability before rendering a control.
  assert.match(CARD, /!avail\.available/)
  assert.match(ROOM, /soldOut/)
  assert.match(ROOM, /No slots open/)
})

test("remaining capacity is stated, never implied", () => {
  // `slots_open` is real reviewer capacity, which is why it can be shown. It is
  // the reason the promise is keepable, not a scarcity device.
  assert.match(CARD, /slots_open/)
  assert.match(ROOM, /slots_open/)
})

test("the offer says the service is a call", () => {
  assert.match(ROOM, /A call about an AI workflow you actually run/)
  assert.match(ROOM, /Book the call/)
})

test("the intake asks when the buyer is free", () => {
  // The service is a call, so a time is part of the brief rather than something
  // chased over email after payment.
  assert.match(FORM, /when_you_are_free/)
  assert.match(FORM, /When you are free/)
})

test("the offer states that the free surfaces stay free", () => {
  assert.match(ROOM, /stay free/)
})

test("no refund language anywhere", () => {
  // Deliberate: this is a service business and the call is the service. Copy
  // that hedges with a refund promise sells something we are not selling.
  for (const source of [CARD, ROOM, FORM]) {
    assert.ok(!/refund/i.test(source))
    assert.ok(!/money.back/i.test(source))
  }
})

test("the buyer is never shown a model draft", () => {
  // `draft` lives in a reviewer-only table; nothing in the UI should reference
  // it, and a delivered audit renders only signed text.
  for (const source of [CARD, ROOM]) {
    assert.ok(!/draft/i.test(source))
  }
  assert.match(ROOM, /audit\.status === "delivered" && audit\.audit_text/)
})

test("a delivered audit shows who signed it", () => {
  assert.match(ROOM, /reviewed_by/)
  assert.match(CARD, /reviewed_by/)
})

test("copy carries no prose em dash", () => {
  // frontend-design §5. The guard does not catch this one.
  for (const source of [CARD, ROOM, FORM]) {
    const strings = source.match(/"[^"\n]{12,}"/g) ?? []
    for (const s of strings) assert.ok(!s.includes("—"), `em dash in UI copy: ${s}`)
  }
})
