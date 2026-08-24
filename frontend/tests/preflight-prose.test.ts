/**
 * The run bar's sentences — the only text this surface states that is not
 * already a plate on screen.
 *
 * Most of this file used to cover the BRIEF: an English paragraph assembled
 * from the order's standalone statements, with real grammar rules (the place
 * stated once, a fragment losing its capital mid-sentence unless it opened
 * with an initialism, an about-you line taking a lead-in). Every case was a
 * sentence the old pre-flight actually printed. The order is plates now, and a
 * paragraph restating them is a second, worse copy of what the reader can
 * already see — so the brief, the market sheet's shorter summary, and all the
 * normalisation under both went with the surfaces that rendered them.
 *
 * What is left is the sentence under Run. It has to count what actually
 * happens rather than what the screen implies: an unanswered guess is DROPPED
 * at run time, and saying so is what makes this a consent screen.
 */
import { strict as assert } from "node:assert"
import { test } from "node:test"

import {
  blockedLine,
  contractLine,
  countsFrom,
  missingRoleLine,
} from "../lib/preflight/prose"
import type { OrderLine, OrderState } from "../lib/preflight/types"

let seq = 0
function line(partial: Partial<OrderLine> & Pick<OrderLine, "kind" | "text">): OrderLine {
  seq += 1
  return {
    id: `l${seq}`,
    source: "myro_inferred",
    origin: "memory_import",
    status: "kept",
    ...partial,
  }
}

function order(partial: Partial<OrderState> = {}): OrderState {
  return { said: "", lines: [], log: [], ...partial }
}

// ── case normalisation ───────────────────────────────────────────────────────

test("nothing dropped says so, and counts every kept line", () => {
  const o = order({
    lines: [line({ kind: "wont_take", text: "A" }), line({ kind: "lean", text: "B" })],
  })
  assert.equal(contractLine(o), "Nothing dropped — Myro runs on all 2 lines above and nothing else.")
})

test("unanswered lines are named as dropped, because they are", () => {
  const o = order({
    lines: [
      line({ kind: "wont_take", text: "A", status: "kept" }),
      line({ kind: "wont_take", text: "B", status: "dropped" }),
      line({ kind: "lean", text: "C", status: "unanswered" }),
      line({ kind: "lean", text: "D", status: "unanswered" }),
    ],
  })
  assert.equal(
    contractLine(o),
    // "line", not "guess": a rejected line may have been the user's own words.
    "1 line you said no to, 2 left unanswered — all dropped. Myro runs on the 1 line above and nothing else.",
  )
})

test("the contract names no surface — there is only one", () => {
  // This asserted the opposite until 2026-08-21: a clause reassuring the
  // reader that a line added in the market bottom-sheet was "part of the same
  // order". That sentence only had a job while there were two surfaces to be
  // confused about, and it now names one that does not exist.
  const o = order({
    lines: [
      line({ kind: "wont_take", text: "A", status: "kept" }),
      line({ kind: "wont_take", text: "B", status: "kept", origin: "market" }),
    ],
  })
  assert.doesNotMatch(contractLine(o), /market sheet/)
})

test("the contract counts what the resolver will use, not every kept line", () => {
  const o = order({
    lines: [
      line({ kind: "goal", text: "Staff engineer" }),
      line({ kind: "goal", text: "Founding PM" }),
    ],
    used: 0,
  })
  assert.equal(
    contractLine(o),
    "Nothing dropped — Myro runs on all 0 lines above and nothing else.",
  )
})

test("counts are read off status, never inferred", () => {
  const o = order({
    lines: [
      line({ kind: "wont_take", text: "A", status: "kept" }),
      line({ kind: "wont_take", text: "B", status: "dropped" }),
      line({ kind: "lean", text: "C", status: "unanswered" }),
    ],
  })
  assert.deepEqual(countsFrom(o), { kept: 1, dropped: 1, unanswered: 1 })
})


test("the bar names the empty slot rather than counting the full ones", () => {
  // Nine exclusions and no role is not a broad search, it is no search: the
  // spec omits an empty slot and the profile write is a PATCH, so running it
  // would search on stored titles the modal never put on screen.
  const said = missingRoleLine()
  assert.match(said, /The work/, "it points at a header the reader can see")
  assert.doesNotMatch(said, /slot|target_role|spec|PATCH/i, "no schema words")
})
