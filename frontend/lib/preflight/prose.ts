/**
 * The run bar's sentences. Pure — no React, no network, no dates.
 *
 * This module used to assemble the whole order into English: `briefFrom` built
 * the review screen's paragraph out of standalone statements, with real rules
 * for it (the place stated once whichever clause carried it, a fragment losing
 * its capital mid-sentence unless it opened with an initialism, an about-you
 * line taking a lead-in) and `orderSummaryFrom` built the market sheet's
 * shorter restatement of the same lines. Both existed because the order was
 * PROSE the user read and signed off.
 *
 * The order is plates now. Six headed groups, one statement each, editable in
 * place — a paragraph restating them is a second, worse copy of what is already
 * on screen, and the sheet that carried the other one is gone. So the assembly
 * rules went with them: `fragment`, `placeSentence`, `joinWords`, the
 * proper-noun heuristics, the whole normalisation layer.
 *
 * What survives is the only text that is NOT on screen anywhere else — the one
 * sentence under the Run button that says what pressing it will do. It has to
 * count what actually happens rather than what the screen implies, which is the
 * difference between a confirmation screen and a consent screen.
 */

import type { OrderState } from "./types"

export interface OrderCounts {
  kept: number
  dropped: number
  unanswered: number
}

export function countsFrom(order: OrderState): OrderCounts {
  return {
    kept: order.lines.filter((l) => l.status === "kept").length,
    dropped: order.lines.filter((l) => l.status === "dropped").length,
    unanswered: order.lines.filter((l) => l.status === "unanswered").length,
  }
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/**
 * What the run bar says while a slot is still contested.
 *
 * `contractLine` cannot answer this. `order.used` counts only lines the
 * resolver actually placed into the six-slot spec, and an over-arity slot
 * contributes NOTHING — `payload.py` skips the whole group. A user with three
 * contested slots therefore gets `used === 0`, and the contract sentence reads
 * "Myro runs on the 0 lines above and nothing else" underneath twenty visible
 * plates. That shipped on 2026-08-19. It is not a rounding error; it is the
 * surface stating the opposite of what is on screen.
 *
 * So while anything is contested the bar states the block instead of the
 * count. The count is only meaningful once the resolver can place every slot.
 */
export function blockedLine(contested: number): string {
  const q = `${contested} ${plural(contested, "question", "questions")}`
  return `${q} above still open — Myro runs once ${plural(contested, "it's", "they're")} settled.`
}

/**
 * What the run bar says when the slot that DEFINES the search is empty.
 *
 * "The work" is not one of six equal slots. Every other slot narrows a search;
 * this one is the search. An order of nine exclusions and no role is not a
 * broad search, it is no search — and because `resolve` omits an empty slot
 * from the spec and the profile write is a PATCH, running it would silently
 * search on stored titles the modal never showed. So the bar names the slot
 * rather than the rule: the header it points at is on screen, three inches up.
 */
export function missingRoleLine(): string {
  return "No role yet — Myro runs once The work has one."
}

/**
 * The promise under the plates. This sentence is the whole surface's contract,
 * so it counts what actually happens: an unanswered guess is DROPPED at run
 * time, and saying so is what makes this a consent screen.
 */
export function contractLine(order: OrderState): string {
  const { kept: keptCount, dropped, unanswered } = countsFrom(order)
  const runCount = typeof order.used === "number" ? order.used : keptCount
  const lines = `${runCount} ${plural(runCount, "line", "lines")}`

  if (dropped + unanswered === 0) {
    return `Nothing dropped — Myro runs on all ${lines} above and nothing else.`
  }
  // "line", not "guess": a line the user said no to may well have been their
  // own — the goal that read "No" is `you said this`. Naming everything a
  // guess here would tell them Myro proposed something they typed.
  const said = dropped ? `${dropped} ${plural(dropped, "line", "lines")} you said no to` : ""
  const left = unanswered ? `${unanswered} left unanswered` : ""
  const both = [said, left].filter(Boolean).join(", ")
  return `${both} — all dropped. Myro runs on the ${lines} above and nothing else.`
}
