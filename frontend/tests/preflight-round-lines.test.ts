import { strict as assert } from "node:assert"
import { test } from "node:test"

import {
  answeredInRound,
  normLineKey,
  totalInRound,
  visibleRoundLineIds,
} from "../lib/preflight/round-lines"
import type { OrderLine, OrderRound } from "../lib/preflight/types"

const line = (partial: Partial<OrderLine> & Pick<OrderLine, "id" | "text" | "kind">): OrderLine => ({
  source: "myro_inferred",
  origin: "memory_import",
  status: "unanswered",
  ...partial,
})

test("visibleRoundLineIds drops duplicate text from later rounds", () => {
  const rounds: OrderRound[] = [
    { key: "wont", line_ids: ["w1"] },
    { key: "drawn", line_ids: ["d1", "d2"] },
  ]
  const byId = new Map<string, OrderLine>([
    ["w1", line({ id: "w1", kind: "wont_take", text: "Prefers onsite work", status: "kept" })],
    ["d1", line({ id: "d1", kind: "lean", text: "Prefers onsite work" })],
    ["d2", line({ id: "d2", kind: "lean", text: "Prefers corporate functions" })],
  ])

  assert.deepEqual(visibleRoundLineIds(rounds, 1, byId), ["d2"])
  assert.equal(answeredInRound(rounds, 0, byId), 1)
  assert.equal(totalInRound(rounds, 1, byId), 1)
})

test("normLineKey ignores case and punctuation", () => {
  assert.equal(normLineKey("Prefers onsite work"), normLineKey("prefers onsite work."))
})
