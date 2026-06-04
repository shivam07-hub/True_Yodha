export interface ForgeClockSnapshot {
  durationSeconds: number
  sessionActive: boolean
  running: boolean
  startedAt: number | null
  pausedAt: number | null
  pausedMs: number
  claimedMinutes: number
  carriedMinutes: number
  lastTickAt: number | null
}

export interface ReconciledForgeClock {
  remaining: number
  pendingMinutes: number
  lastTickAt: number | null
  activeElapsedMs: number
}

// The live heartbeat ticks once a second while the tab is foreground.
export const FORGE_HEARTBEAT_MS = 1000
// A gap larger than this between heartbeats means the tab was hidden, closed,
// or background-throttled — that wall-clock time must NOT accrue. See CONTEXT.md
// → "Forge Session": the timer is never always-running.
export const FORGE_IDLE_GAP_GRACE_MS = 4000

/**
 * Fold any idle gap since the last heartbeat into `pausedMs` so it is excluded
 * from earned minutes. Only meaningful while `running` — a paused session is
 * already frozen by `pausedAt`. This is the seam that makes "time only counts
 * while you are actually here" true, regardless of how the tab was left.
 */
export function foldIdleGap(
  pausedMs: number,
  running: boolean,
  lastTickAt: number | null,
  now: number,
): number {
  if (!running || lastTickAt === null) return pausedMs
  const gap = now - lastTickAt
  if (gap > FORGE_IDLE_GAP_GRACE_MS) return pausedMs + (gap - FORGE_HEARTBEAT_MS)
  return pausedMs
}

export function reconcileForgeClock(
  snapshot: ForgeClockSnapshot,
  now: number,
): ReconciledForgeClock {
  if (!snapshot.sessionActive || snapshot.startedAt === null) {
    return {
      remaining: snapshot.durationSeconds,
      pendingMinutes: Math.max(0, snapshot.carriedMinutes - snapshot.claimedMinutes),
      lastTickAt: snapshot.lastTickAt,
      activeElapsedMs: 0,
    }
  }

  const pausedCarry = snapshot.running || snapshot.pausedAt === null
    ? 0
    : Math.max(0, now - snapshot.pausedAt)
  const activeElapsedMs = Math.max(0, now - snapshot.startedAt - snapshot.pausedMs - pausedCarry)
  const elapsedSeconds = Math.floor(activeElapsedMs / 1000)
  const cycleElapsed = elapsedSeconds % snapshot.durationSeconds
  const earnedMinutes = Math.floor(activeElapsedMs / 60_000)

  return {
    remaining: cycleElapsed === 0 ? snapshot.durationSeconds : snapshot.durationSeconds - cycleElapsed,
    pendingMinutes: Math.max(0, snapshot.carriedMinutes + earnedMinutes - snapshot.claimedMinutes),
    lastTickAt: snapshot.running ? now : snapshot.lastTickAt,
    activeElapsedMs,
  }
}
