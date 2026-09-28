// Real velocity: week-over-week delta from a 14-day daily-bin histogram.
// bins[0] = oldest day, bins[13] = today.
export function weekDeltaFromBins(bins: number[]): number {
  if (!bins || bins.length < 14) return 0
  let recent = 0
  let prior = 0
  for (let i = 0; i < 7; i++) prior += bins[i] || 0
  for (let i = 7; i < 14; i++) recent += bins[i] || 0
  return recent - prior
}

