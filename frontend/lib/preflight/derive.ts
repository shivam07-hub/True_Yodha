/**
 * The Order, partitioned for the screen. Pure — no React, no network.
 *
 * Lifted out of `journey.tsx` to keep that file under the 300-line rule, and
 * because a partition is exactly the kind of thing that should be testable
 * without mounting a modal.
 */

import { SLOT_COPY } from "./slots"
import { STEPS } from "./journey"
import type {
  Order,
  OrderConflict,
  OrderLine,
  SlotKey,
} from "./types"

export interface StepGroup {
  copy: (typeof SLOT_COPY)[SlotKey]
  arity: number
  /** Placed + contested, from the resolver's own partition. Counting the
   *  rendered chips instead is what turned a six-line slot into "15 of 6". */
  filled: number
  lines: OrderLine[]
  conflicts: OrderConflict[]
}

/**
 * The groups, as the RESOLVER partitioned them.
 *
 * The client used to file `order.lines` into slots itself against a
 * hand-mirrored arity table. The two implementations agreed key-for-key and
 * disagreed where it mattered — the server deduped before filing and the
 * client did not — so one statement rendered twice, once as a settled plate
 * and once inside the conflict holding its twin, and the header counted both
 * (`Won't take · 15 of 6`).
 *
 * The one thing done to the server's answer here is the OPTIMISTIC filter: a
 * line the user just dropped disappears on the tap rather than on the
 * response. That is respecting a local edit, not re-deciding the partition.
 */
export function groupsFrom(order: Order, conflicts: OrderConflict[]): Map<SlotKey, StepGroup> {
  const byId = new Map(order.lines.map((l) => [l.id, l]))
  const clashes = new Map<string, OrderConflict[]>()
  for (const conflict of conflicts) {
    const bucket = clashes.get(conflict.slot)
    if (bucket) bucket.push(conflict)
    else clashes.set(conflict.slot, [conflict])
  }
  const live = (ids: string[]): OrderLine[] =>
    ids.flatMap((id) => {
      const line = byId.get(id)
      return line && line.status === "kept" ? [line] : []
    })

  const out = new Map<SlotKey, StepGroup>()
  for (const slot of order.slots ?? []) {
    const lines = live(slot.line_ids)
    const held = live(slot.contested_ids)
    out.set(slot.key, {
      copy: SLOT_COPY[slot.key],
      arity: slot.arity,
      lines,
      conflicts: clashes.get(slot.key) ?? [],
      filled: lines.length + held.length,
    })
  }
  return out
}

/**
 * Kept lines the resolver files to no slot — a notice period, a visa status.
 *
 * True of the person and actionable by nobody, so they spend no slot budget.
 * Rendered anyway, because a line that vanishes when Myro reclassifies it is
 * worse than one that overflows: the user can see an overflow.
 */
export function factsFrom(order: Order): OrderLine[] {
  const ids = new Set(order.facts ?? [])
  return order.lines.filter((l) => l.status === "kept" && ids.has(l.id))
}

/** Every slot in STEP order — which is also the order running from the thing
 *  that DEFINES the search to the thing that only colours it. `journey.ts` is
 *  the single owner of that sequence. */
export function groupsInStepOrder(groups: Map<SlotKey, StepGroup>): StepGroup[] {
  return STEPS.flatMap((step) => step.slots).flatMap((key) => {
    const group = groups.get(key)
    return group ? [group] : []
  })
}
