/**
 * The resolver's report, as the review screen acts on it.
 *
 * Conflicts live on the order GET. Visibility is derived from the lines'
 * current status so an optimistic drop hides the card without waiting for
 * the next report.
 */

import type { OrderConflict, OrderState } from "./types"

export function liveIds(order: OrderState, conflict: OrderConflict): string[] {
  const byId = new Map(order.lines.map((line) => [line.id, line]))
  return conflict.line_ids.filter((id) => byId.get(id)?.status === "kept")
}

export function visibleConflicts(order: OrderState): OrderConflict[] {
  return (order.conflicts ?? []).filter((conflict) => {
    const live = liveIds(order, conflict)
    if (conflict.kind === "contradiction") return live.length >= 2
    return live.length > conflict.keep
  })
}

/** Contradiction and arity-1: pick one to keep. Overflow of a larger slot: drop that one. */
export function dropIdsForPick(conflict: OrderConflict, chosen: string): string[] {
  const pickKeep = conflict.kind === "contradiction" || conflict.keep === 1
  if (pickKeep) return conflict.line_ids.filter((id) => id !== chosen)
  return [chosen]
}

export function conflictAsk(conflict: OrderConflict): string {
  if (conflict.kind === "contradiction") return "These can't both be true"
  if (conflict.keep === 1) return "Pick the one Myro should run"
  return `This takes ${conflict.keep} — tap one to drop`
}
