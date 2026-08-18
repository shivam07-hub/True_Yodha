import type { OrderLine, OrderRound } from "./types"

/** Match the server's round builder — one statement, one round. */
export function normLineKey(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "")
}

/** Line ids for one round, minus duplicates already shown in earlier rounds. */
export function visibleRoundLineIds(
  rounds: OrderRound[],
  roundIndex: number,
  lineById: Map<string, OrderLine>,
): string[] {
  const round = rounds[roundIndex]
  if (!round) return []

  const earlier = new Set<string>()
  for (let i = 0; i < roundIndex; i++) {
    for (const id of rounds[i]?.line_ids ?? []) {
      const line = lineById.get(id)
      if (line) earlier.add(normLineKey(line.text))
    }
  }

  return round.line_ids.filter((id) => {
    const line = lineById.get(id)
    return line && !earlier.has(normLineKey(line.text))
  })
}

export function answeredInRound(
  rounds: OrderRound[],
  roundIndex: number,
  lineById: Map<string, OrderLine>,
): number {
  return visibleRoundLineIds(rounds, roundIndex, lineById).filter(
    (id) => lineById.get(id)?.status !== "unanswered",
  ).length
}

export function totalInRound(
  rounds: OrderRound[],
  roundIndex: number,
  lineById: Map<string, OrderLine>,
): number {
  return visibleRoundLineIds(rounds, roundIndex, lineById).length
}
