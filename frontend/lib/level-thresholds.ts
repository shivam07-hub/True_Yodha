/**
 * Forge session counts per L→L+1 advancement.
 * Mirror of backend app/services/forge_service.py LEVEL_THRESHOLDS.
 * Update both together.
 */
export const LEVEL_THRESHOLDS: Record<number, number> = {
  0: 1,
  1: 3,
  2: 9,
  3: 27,
}

export const MAX_LEVEL = 4

export function sessionsForGap(fromLevel: number, toLevel: number): number {
  const f = Math.max(0, Math.min(MAX_LEVEL, Math.floor(fromLevel)))
  const t = Math.max(f, Math.min(MAX_LEVEL, Math.floor(toLevel)))
  let total = 0
  for (let lvl = f; lvl < t; lvl++) {
    total += LEVEL_THRESHOLDS[lvl] ?? 0
  }
  return total
}
