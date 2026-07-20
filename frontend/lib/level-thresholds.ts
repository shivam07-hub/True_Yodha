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

/**
 * Honest "practice sessions remaining to the next level" for a skill (S3).
 * Deterministic — no fabricated weekly cadence. Handles a CV-inferred level with
 * zero forge sessions: `forgeSessions - sessionsForGap(0, level)` goes negative,
 * so the sessions-into-current-level clamps to 0 and the answer is the full
 * next-level threshold (honest: the CV proved the level, forging to the next
 * takes the whole threshold). Returns 0 at or beyond MAX_LEVEL.
 */
export function sessionsToNextLevel(level: number, forgeSessions: number): number {
  const lvl = Math.max(0, Math.min(MAX_LEVEL, Math.floor(level)))
  if (lvl >= MAX_LEVEL) return 0
  const threshold = LEVEL_THRESHOLDS[lvl] ?? 0
  const into = Math.max(0, forgeSessions - sessionsForGap(0, lvl))
  return Math.max(0, threshold - into)
}
