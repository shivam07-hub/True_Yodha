/**
 * The brief's grammar is a spec, not a nicety.
 *
 * Every case here is a sentence the OLD pre-flight actually printed, or one the
 * new assembly rules exist to prevent. The surface's whole promise is that the
 * paragraph on the review screen is what Myro runs on — a brief that reads like
 * a machine assembled it is a brief nobody signs off, and one that states the
 * city twice is a brief that proves Myro wasn't listening.
 */
import { strict as assert } from "node:assert"
import { test } from "node:test"

import {
  briefFrom,
  contractLine,
  countsFrom,
  missingRoleLine,
  fragment,
  joinWords,
  orderSummaryFrom,
  placeSentence,
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

test("a fragment loses its capital mid-sentence", () => {
  assert.equal(fragment("People-management roles"), "people-management roles")
  assert.equal(fragment("Corporate-function roles over agency work."), "corporate-function roles over agency work")
})

test("initialisms and proper nouns keep their capitals", () => {
  // The blanket toLowerCase this replaced produced "senior ic tracks".
  assert.equal(fragment("Senior IC tracks (staff / principal)"), "Senior IC tracks (staff / principal)")
  assert.equal(fragment("IC tracks"), "IC tracks")
  assert.equal(fragment("Bengaluru"), "Bengaluru")
  assert.equal(fragment("AI tooling"), "AI tooling")
})

test("joinWords reads as a list, not a comma-join", () => {
  assert.equal(joinWords(["a"]), "a")
  assert.equal(joinWords(["a", "b"]), "a and b")
  assert.equal(joinWords(["a", "b", "c"]), "a, b and c")
  assert.equal(joinWords([]), "")
})

// ── location de-duplication ──────────────────────────────────────────────────

test("the place is not stated twice when the user already named it", () => {
  assert.equal(placeSentence("tech sales in Bengaluru", ["Bengaluru"]), "")
})

test("a remote option the user did not mention is added, not repeated", () => {
  assert.equal(
    placeSentence("tech sales in Bengaluru", ["Remote-first roles, anywhere in India"]),
    "Also open to remote-first roles, anywhere in India.",
  )
  // They already said remote — nothing to add.
  assert.equal(placeSentence("remote tech sales", ["Remote-first roles, anywhere in India"]), "")
})

test("a place the user never named gets its own sentence", () => {
  assert.equal(placeSentence("tech sales", ["Bengaluru"]), "In Bengaluru.")
  assert.equal(placeSentence("tech sales", ["Bengaluru", "remote anywhere in India"]), "In Bengaluru and remote anywhere in India.")
})

test("no location line means no location sentence — never 'In .'", () => {
  assert.equal(placeSentence("tech sales", []), "")
})

// ── the brief ────────────────────────────────────────────────────────────────

test("the brief opens with the user's own words, untouched", () => {
  const o = order({ said: "tech sales in Bengaluru, but not people management." })
  assert.equal(briefFrom(o), "Look for tech sales in Bengaluru, but not people management.")
})

test("won't-takes lose their stored 'No ' and join one Skip sentence", () => {
  const o = order({
    said: "tech sales",
    lines: [
      line({ kind: "wont_take", text: "Large corporations" }),
      line({ kind: "wont_take", text: "No data scientist roles" }),
    ],
  })
  assert.equal(briefFrom(o), "Look for tech sales. Skip large corporations, data scientist roles.")
})

test("about-you lines get a lead-in and lose their stored label", () => {
  const o = order({
    said: "tech sales",
    lines: [
      line({ kind: "goal", text: 'Where you’re headed: “Staff engineer”', source: "user_said" }),
      line({ kind: "strength", text: "Best at: working with a team, with AI, and with data analytics", source: "user_said" }),
    ],
  })
  const brief = briefFrom(o)
  // The old surface printed "You're heading for No." with no lead-in at all.
  assert.match(brief, /Aiming for staff engineer\./)
  assert.match(brief, /Strongest at working with a team, with AI, and with data analytics\./)
  assert.doesNotMatch(brief, /Where you/)
  assert.doesNotMatch(brief, /Best at:/)
})

test("only kept lines reach the brief — dropped and unanswered never do", () => {
  const o = order({
    said: "tech sales",
    lines: [
      line({ kind: "wont_take", text: "Large corporations", status: "kept" }),
      line({ kind: "wont_take", text: "Data scientist roles", status: "dropped" }),
      line({ kind: "wont_take", text: "Consultative work", status: "unanswered" }),
      line({ kind: "lean", text: "Senior IC tracks", status: "unanswered" }),
    ],
  })
  const brief = briefFrom(o)
  assert.match(brief, /large corporations/)
  assert.doesNotMatch(brief, /data scientist/i)
  assert.doesNotMatch(brief, /consultative/i)
  assert.doesNotMatch(brief, /Lean toward/)
})

test("a reworded location rewrites the clause instead of adding a second one", () => {
  const o = order({
    said: "tech sales",
    lines: [
      line({ kind: "location", text: "South Bengaluru, or fully remote", source: "user_reworded" }),
    ],
  })
  const brief = briefFrom(o)
  assert.equal(brief.match(/In /g)?.length, 1)
  assert.match(brief, /In South Bengaluru, or fully remote\./)
})

test("an empty order produces no stray punctuation", () => {
  assert.equal(briefFrom(order()), "")
})

// ── the market sheet's summary ───────────────────────────────────────────────

test("both surfaces punctuate before appending — never 'tech sales No X'", () => {
  const o = order({
    said: "tech sales in Bengaluru",
    lines: [line({ kind: "wont_take", text: "Large corporations" })],
  })
  assert.equal(orderSummaryFrom(o), "tech sales in Bengaluru. No large corporations.")
})

test("the summary carries every bucket the brief does", () => {
  const o = order({
    said: "tech sales",
    lines: [
      line({ kind: "location", text: "Bengaluru" }),
      line({ kind: "wont_take", text: "Large corporations" }),
      line({ kind: "pay_floor", text: "₹45L total comp" }),
    ],
  })
  const summary = orderSummaryFrom(o)
  assert.match(summary, /Bengaluru/)
  assert.match(summary, /No large corporations/)
  assert.match(summary, /45L/)
})

// ── the contract line ────────────────────────────────────────────────────────

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
