/**
 * The six slots, as the reader meets them.
 *
 * THE ONE IDEA in MYRO_SEARCH_REBUILD.md: *the Order is not a list the user
 * maintains, it is a conversational way to fill a six-slot search spec the
 * backend already has.* A flat column of every kept line is therefore the one
 * shape the surface must never take — it hides the only structure that exists,
 * and it cannot answer the question the user actually has when they open the
 * modal, which is "what does Myro still need from me?"
 *
 * This module is the client half of that spec. It MIRRORS
 * `backend/app/services/preflight/payload.py` — `SLOT_ARITY` and `_SLOT_KINDS`
 * — and `tests/preflight-slots.test.ts` reads the Python and asserts they have
 * not drifted, because two hand-maintained copies of one contract is how a
 * `location` line ends up filed under "Won't take" on screen while the
 * resolver puts it somewhere else.
 *
 * Order matters: it is the order the groups render in, and it runs from the
 * thing that defines the search (the work) to the thing that only colours it
 * (what you're best at).
 */

import type { LineKind } from "./types"

export type SlotKey =
  | "target_role_titles"
  | "target_location"
  | "deal_breakers"
  | "lean"
  | "career_goal"
  | "superpower"

export interface SlotSpec {
  key: SlotKey
  /** The group header. A noun, ≤ 3 common words. */
  label: string
  /** How many lines the resolver will accept. Over this is a conflict. */
  arity: number
  /** Line kinds that file into this slot. */
  kinds: readonly LineKind[]
  /** What a direct add on this group creates — no inference needed, the user
   *  picked the slot by choosing which "+" to press. */
  addKind: LineKind
  /** The add chip's copy. Doubles as the empty state, so it has to read as an
   *  invitation on its own: "a city, or remote", not "Add location". */
  invite: string
}

export const SLOTS: readonly SlotSpec[] = [
  {
    key: "target_role_titles",
    label: "The work",
    arity: 6,
    kinds: ["role"],
    addKind: "role",
    invite: "a role you want",
  },
  {
    key: "target_location",
    label: "Where",
    arity: 1,
    kinds: ["location"],
    addKind: "location",
    invite: "a city, or remote",
  },
  {
    key: "deal_breakers",
    label: "Won't take",
    arity: 6,
    kinds: ["wont_take", "pay_floor"],
    addKind: "wont_take",
    invite: "something you'd turn down",
  },
  {
    key: "lean",
    label: "Drawn to",
    arity: 6,
    kinds: ["lean"],
    addKind: "lean",
    invite: "something that pulls you",
  },
  {
    key: "career_goal",
    label: "Aiming for",
    arity: 1,
    kinds: ["goal"],
    addKind: "goal",
    invite: "where this is heading",
  },
  {
    key: "superpower",
    label: "Best at",
    arity: 1,
    kinds: ["strength"],
    addKind: "strength",
    invite: "what you're strongest at",
  },
]

const SLOT_OF_KIND = new Map<LineKind, SlotKey>(
  SLOTS.flatMap((slot) => slot.kinds.map((kind) => [kind, slot.key] as const)),
)

export function slotForKind(kind: LineKind): SlotKey | null {
  return SLOT_OF_KIND.get(kind) ?? null
}

/**
 * The count beside a group header, or null when it would be noise.
 *
 * A slot holding two of a possible six does not need to be told it has room —
 * the reader can see two plates. The number earns its place only when the
 * limit is in play: at it, or over it. On a one-slot group it is never worth
 * saying, because "1 of 1" is the plate restated, and the over-case is already
 * carried by the conflict plate inside the group.
 */
export function slotCount(spec: SlotSpec, filled: number): string | null {
  if (spec.arity === 1) return null
  if (filled < spec.arity) return null
  return `${filled} of ${spec.arity}`
}
