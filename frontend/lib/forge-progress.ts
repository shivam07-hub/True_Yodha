export function forgeElapsedSeconds(durationSeconds: number, remainingSeconds: number): number {
  const duration = Math.max(0, Math.floor(durationSeconds))
  const remaining = Math.max(0, Math.min(duration, Math.floor(remainingSeconds)))
  return duration - remaining
}

export function claimableForgeMinutes(durationSeconds: number, remainingSeconds: number): number {
  return Math.floor(forgeElapsedSeconds(durationSeconds, remainingSeconds) / 60)
}

export function claimableForgeXP(durationSeconds: number, remainingSeconds: number, xpPerMinute: number): number {
  return claimableForgeMinutes(durationSeconds, remainingSeconds) * Math.max(0, xpPerMinute)
}

export function forgeProgressRatio(durationSeconds: number, remainingSeconds: number): number {
  const duration = Math.max(1, Math.floor(durationSeconds))
  return forgeElapsedSeconds(duration, remainingSeconds) / duration
}
