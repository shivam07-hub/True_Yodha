import { strict as assert } from "node:assert"
import { test } from "node:test"

import {
  conflictAsk,
  dropIdsForPick,
  visibleConflicts,
} from "../lib/preflight/conflicts"
import type { OrderConflict, OrderLine, OrderState } from "../lib/preflight/types"

function line(partial: Partial<OrderLine> & Pick<OrderLine, "id" | "kind" | "text">): OrderLine {
  return {
    source: "myro_inferred",
    origin: "memory_import",
    status: "kept",
    ...partial,
  }
}

function order(partial: Partial<OrderState> = {}): OrderState {
  return { said: "", lines: [], log: [], ...partial }
}

const either: OrderConflict = {
  slot: "deal_breakers",
  kind: "contradiction",
  line_ids: ["w", "l"],
  texts: ["Prefers onsite work", "Prefers onsite work"],
  keep: 6,
}

test("a contradiction drops the line that wasn't picked", () => {
  assert.deepEqual(dropIdsForPick(either, "w"), ["l"])
  assert.equal(conflictAsk(either), "These can't both be true")
})

test("an optimistic drop hides the card before the next report", () => {
  const open = order({
    lines: [
      line({ id: "w", kind: "wont_take", text: "Prefers onsite work" }),
      line({ id: "l", kind: "lean", text: "Prefers onsite work" }),
    ],
    conflicts: [either],
  })
  assert.equal(visibleConflicts(open).length, 1)

  const after = order({
    lines: [
      line({ id: "w", kind: "wont_take", text: "Prefers onsite work" }),
      line({ id: "l", kind: "lean", text: "Prefers onsite work", status: "dropped" }),
    ],
    conflicts: [either],
  })
  assert.deepEqual(visibleConflicts(after), [])
})

test("duplicates are not a conflict", () => {
  // The resolver collapses a repeated statement before it files anything, so a
  // duplicate never reaches the client as a line OR as a question. It used to
  // report how many it had collapsed (`duplicates_collapsed`); nothing read the
  // number, and with the client rendering `slots` there is nothing to explain.
  const o = order({
    lines: [line({ id: "a", kind: "wont_take", text: "Large corporations" })],
    conflicts: [],
  })
  assert.deepEqual(visibleConflicts(o), [])
})

test("arity-1 keeps the pick and drops the rest", () => {
  const conflict: OrderConflict = {
    slot: "career_goal",
    kind: "arity",
    line_ids: ["g1", "g2", "g3"],
    texts: ["Staff", "PM", "Research"],
    keep: 1,
  }
  assert.deepEqual(dropIdsForPick(conflict, "g2"), ["g1", "g3"])
  assert.equal(conflictAsk(conflict), "Pick the one Myro should run")
})
