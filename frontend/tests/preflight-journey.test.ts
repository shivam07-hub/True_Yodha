/**
 * The step machine — the part of the journey worth testing, and the part that
 * carries the risk a stepped flow introduces.
 *
 * Splitting one canvas into five screens fixes the scroll and creates the
 * opposite defect: a user whose order is already right being walked through
 * four Continues to change nothing. `landingStep` is the whole answer to that,
 * so it is asserted here rather than eyeballed once in an authed session
 * nobody can reach (the QA account tops out before this modal).
 */
import { strict as assert } from "node:assert"
import { test } from "node:test"

import {
  STEPS,
  landingStep,
  needsByStep,
  stepForKind,
  stepForProposal,
  stepForSlot,
} from "../lib/preflight/journey"
import type {
  LineKind,
  Order,
  OrderConflict,
  OrderLine,
  OrderProposal,
  SlotKey,
} from "../lib/preflight/types"

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

function order(lines: OrderLine[] = [], partial: Partial<Order> = {}): Order {
  return {
    said: "",
    lines,
    log: [],
    memory_count: 0,
    cv_readiness: "ready",
    ...partial,
  }
}

const role = () => line({ kind: "role", text: "IT Sales", source: "user_said" })

function proposal(partial: Partial<OrderProposal> = {}): OrderProposal {
  return {
    id: "p1",
    eyebrow: "LOCATION",
    value: "Pune",
    why: "you mentioned it",
    effects: [{ op: "add", kind: "location", text: "Pune", label: "new line · where" }],
    costly: false,
    ...partial,
  }
}

const need = (o: Order | undefined, conflicts: OrderConflict[] = [], proposals: OrderProposal[] = [], answered: Record<string, unknown> = {}) =>
  needsByStep(o, conflicts, proposals, answered)

// ── the landing ──────────────────────────────────────────────────────────────

test("a settled order opens on Sign off, not on step one", () => {
  // The rule that makes steps safe for a returning user. Myro already knows
  // this; re-asking it is the opposite of remembering.
  const o = order([role(), line({ kind: "location", text: "Bengaluru" })])
  assert.equal(landingStep(need(o)), "signoff")
})

test("an order with no role opens on the work — the one slot that is the search", () => {
  const o = order([line({ kind: "location", text: "Bengaluru" })])
  assert.equal(landingStep(need(o)), "work")
})

test("a blank order opens on the work, where the composer is", () => {
  assert.equal(landingStep(need(order())), "work")
})

test("the landing is the FIRST step that asks something, in step order", () => {
  // A guess about a city and a guess about pay must not fight over the
  // landing: the earlier step wins, and the ribbon's dot shows the rest.
  const o = order([
    role(),
    line({ kind: "location", text: "Pune", status: "unanswered" }),
    line({ kind: "wont_take", text: "no travel", status: "unanswered" }),
  ])
  assert.equal(landingStep(need(o)), "where")
})

test("a live conflict lands the journey on the step that owns its slot", () => {
  const conflict: OrderConflict = {
    slot: "deal_breakers",
    kind: "arity",
    line_ids: ["a", "b"],
    texts: ["a", "b"],
    keep: 6,
  }
  const o = order([role()])
  assert.equal(landingStep(need(o, [conflict])), "preferences")
})

test("the say door still lands on the say band, wherever it lives", () => {
  // `openRefreshGate("say")` promised the band. It sits on Sign off, so that
  // is where the intent has to land — a door that opens somewhere else is the
  // two-buttons defect rebuilt inside one modal.
  const o = order([]) // deliberately blank: the intent must win anyway
  assert.equal(landingStep(need(o), "say"), "signoff")
})

test("an answered proposal stops asking, and stops holding the landing", () => {
  const o = order([role()])
  const p = proposal()
  assert.equal(landingStep(need(o, [], [p])), "where")
  assert.equal(landingStep(need(o, [], [p], { p1: "kept" })), "signoff")
})

// ── routing ──────────────────────────────────────────────────────────────────

test("every line kind has a step, and it is the step that edits its slot", () => {
  const kinds: LineKind[] = [
    "role", "location", "wont_take", "lean", "goal", "strength", "pay_floor", "fact",
  ]
  for (const kind of kinds) {
    const step = stepForKind(kind)
    assert.ok(STEPS.some((s) => s.key === step), `${kind} routes to a step that exists`)
  }
  assert.equal(stepForKind("role"), "work")
  assert.equal(stepForKind("location"), "where")
  // A fact fills no slot at all — a notice period, a visa status — and About
  // you is what it is about.
  assert.equal(stepForKind("fact"), "about")
})

test("every slot has a step, and no slot is orphaned", () => {
  const slots: SlotKey[] = [
    "target_role_titles", "target_locations", "deal_breakers",
    "lean", "career_goal", "superpower",
  ]
  for (const slot of slots) {
    assert.ok(STEPS.some((s) => s.key === stepForSlot(slot)), `${slot} routes to a real step`)
    assert.ok(
      STEPS.some((s) => s.slots.includes(slot)),
      `${slot} is rendered by no step — the user could never fill it`,
    )
  }
})

test("a proposal routes on what it would DO, not on its eyebrow", () => {
  // The eyebrow is prose for display; the effect names the kind. Routing on
  // the eyebrow would file "WON'T TAKE" and "won't take" to different places.
  assert.equal(stepForProposal(proposal()), "where")
  assert.equal(
    stepForProposal(proposal({ eyebrow: "LOCATION", effects: [{ op: "add", kind: "wont_take", text: "x", label: "l" }] })),
    "preferences",
  )
})

test("an untyped proposal lands on Sign off rather than nowhere", () => {
  // A guess that renders on no screen is one the user is never asked about,
  // and `drop_unanswered` then discards it server-side in silence.
  assert.equal(stepForProposal(proposal({ effects: [] })), "signoff")
})

// ── what each step still wants ───────────────────────────────────────────────

test("guesses are counted on the step that will ask them", () => {
  const o = order([
    role(),
    line({ kind: "location", text: "Pune", status: "unanswered" }),
    line({ kind: "lean", text: "product-led", status: "unanswered" }),
    line({ kind: "wont_take", text: "no travel", status: "unanswered" }),
  ])
  const n = need(o)
  assert.equal(n.where.guesses, 1)
  assert.equal(n.preferences.guesses, 2)
  assert.equal(n.work.guesses, 0)
})

test("an unanswered guess never blocks — leaving it is a valid answer", () => {
  // It is DROPPED at run time, and the Sign off contract sentence says so.
  // Blocking on it would turn a stated default into a wall.
  const o = order([role(), line({ kind: "lean", text: "x", status: "unanswered" })])
  const n = need(o)
  assert.equal(n.preferences.guesses, 1)
  assert.equal(n.preferences.blocking, false)
})

test("no order at all asks for nothing, rather than throwing", () => {
  const n = need(undefined)
  for (const step of STEPS) {
    assert.equal(n[step.key].blocking, false)
    assert.equal(n[step.key].guesses, 0)
  }
})

// ── the steps themselves ─────────────────────────────────────────────────────

test("Sign off is last, and the work is first and unskippable", () => {
  assert.equal(STEPS[0].key, "work")
  assert.equal(STEPS[0].optional, false)
  assert.equal(STEPS[STEPS.length - 1].key, "signoff")
  assert.equal(STEPS[STEPS.length - 1].optional, false)
})

test("a step title is a noun, and short enough to set at 30px", () => {
  // Myro's copy law: page titles are nouns. The reference designs ask
  // questions ("What role do you want to find?"); the lede does that work here
  // so the title can stay a name.
  for (const step of STEPS) {
    assert.doesNotMatch(step.title, /\?$/, `${step.key} title is a question`)
    assert.ok(step.title.split(" ").length <= 3, `${step.key} title is over three words`)
    assert.ok(step.lede.length > 0, `${step.key} has no lede`)
  }
})

test("no slot is claimed by two steps", () => {
  const all = STEPS.flatMap((s) => s.slots)
  assert.equal(new Set(all).size, all.length)
})
