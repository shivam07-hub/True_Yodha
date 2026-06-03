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
