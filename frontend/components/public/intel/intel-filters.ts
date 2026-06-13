// Public mirror "uptime" anchor. Fallback used only until the real earliest
// scrape timestamp (analytics.scraper_started) loads; live data overrides it.
const UPTIME_ANCHOR = new Date("2026-04-11T00:00:00Z").getTime()

export function formatUptime(now: number, anchorMs: number = UPTIME_ANCHOR): string {
  const anchor = Number.isFinite(anchorMs) ? anchorMs : UPTIME_ANCHOR
  const ms = Math.max(0, now - anchor)
  const totalSec = Math.floor(ms / 1000)
  const d = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => n.toString().padStart(2, "0")
  return `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`
}

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

