/**
 * Pre-flight's Myro bubble is an acknowledgement. A question with no yes/no
 * is a dead end — those belong as proposal rows.
 */
import { strict as assert } from "node:assert"
import { test } from "node:test"

import { ackFromReply } from "../lib/preflight/reply"

test("a question is not shown", () => {
  assert.equal(
    ackFromReply("Are you willing to consider Bengaluru for these opportunities?"),
    "",
  )
})

test("an acknowledgement is shown", () => {
  assert.equal(ackFromReply("Gurgaon, B2B growth, 30L+."), "Gurgaon, B2B growth, 30L+.")
})

test("blank is blank", () => {
  assert.equal(ackFromReply("   "), "")
})
