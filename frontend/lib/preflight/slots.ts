/**
 * The six slots, in the reader's words.
 *
 * THE ONE IDEA in MYRO_SEARCH_REBUILD.md: *the Order is not a list the user
 * maintains, it is a conversational way to fill a six-slot search spec the
 * backend already has.* A flat column of every kept line is therefore the one
 * shape the surface must never take — it hides the only structure that exists,
 * and it cannot answer the question the user actually has when they open the
 * modal, which is "what does Myro still need from me?"
 *
 * This module used to be the client HALF of that spec: it carried each slot's
 * arity and the kinds that file into it, mirroring `SLOT_ARITY` and
 * `_SLOT_KINDS` in `payload.py`, with a test reading the Python to catch drift.
 * A mirror with a drift detector is still two implementations of one contract,
 * and it drifted in the way a key-for-key test cannot see: the server deduped
 * before filing and the client did not, so the same statement rendered twice —
 * once as a settled plate, once inside the conflict holding its twin — and the
 * group counted both (`Won't take · 15 of 6`).
 *
 * So the resolver now sends its own partition (`order.slots`) and this module
 * keeps only what the server has no business owning: the words. Order matters —
 * it is the order the groups render in, running from the thing that DEFINES the
 * search to the thing that only colours it.
 */

import type { LineKind, SlotKey } from "./types"

export type { SlotKey }

export interface SlotCopy {
  /** The group header. A noun, ≤ 3 common words. */
  label: string
  /** What a direct add on this group creates — no inference needed, the user
   *  picked the slot by choosing which "+" to press. */
  addKind: LineKind
  /** The add chip's copy. Doubles as the empty state, so it has to read as an
   *  invitation on its own: "a city, or remote", not "Add location". */
  invite: string
}

/** Render order, and the only thing the client owns about a slot. */
export const SLOT_COPY: Record<SlotKey, SlotCopy> = {
  target_role_titles: { label: "The work", addKind: "role", invite: "a role you want" },
  target_locations: { label: "Where", addKind: "location", invite: "a city, or remote" },
  deal_breakers: { label: "Won't take", addKind: "wont_take", invite: "something you'd turn down" },
  lean: { label: "Drawn to", addKind: "lean", invite: "something that pulls you" },
  career_goal: { label: "Aiming for", addKind: "goal", invite: "where this is heading" },
  superpower: { label: "Best at", addKind: "strength", invite: "what you're strongest at" },
}

export const SLOT_ORDER: readonly SlotKey[] = [
  "target_role_titles",
  "target_locations",
  "deal_breakers",
  "lean",
  "career_goal",
  "superpower",
]

/**
 * The count beside a group header, or null when it would be noise.
 *
 * A slot holding two of a possible six does not need to be told it has room —
 * the reader can see two plates. The number earns its place only when the
 * limit is in play: at it, or over it. On a one-slot group it is never worth
 * saying, because "1 of 1" is the plate restated, and the over-case is already
 * carried by the conflict plate inside the group.
 *
 * `filled` comes from the resolver's partition, never from counting what
 * happens to be on screen. Counting the rendered plates is what produced
 * "15 of 6" out of a six-line slot.
 */
export function slotCount(arity: number, filled: number): string | null {
  if (arity === 1) return null
  if (filled < arity) return null
  return `${filled} of ${arity}`
}
