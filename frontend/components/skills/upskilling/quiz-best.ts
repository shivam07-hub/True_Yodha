/* Cosmetic quiz speed stat (DEC-S2/S4). Personal-best fastest *passing* clear,
   keyed per (skillId, level), in a single localStorage map. Client-only — the
   durable/server version is deferred. Coins never depend on any of this. */

const KEY = "myro_quiz_best_v1"

type BestMap = Record<string, number>

function mapKey(skillId: number, level: number): string {
  return `${skillId}:${level}`
}

function read(): BestMap {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as BestMap) : {}
  } catch {
    return {}
  }
}

/** Prior best seconds for this set, or null if none recorded yet. */
export function getBestSeconds(skillId: number, level: number): number | null {
  const v = read()[mapKey(skillId, level)]
  return typeof v === "number" ? v : null
}

/**
 * Record a passing clear's time. Returns whether it became the new best
 * (true on a first clear or a faster time). Only call on a pass.
 */
export function recordBestSeconds(skillId: number, level: number, seconds: number): boolean {
  if (typeof window === "undefined") return false
  const all = read()
  const k = mapKey(skillId, level)
  const prev = all[k]
  if (typeof prev === "number" && prev <= seconds) return false
  all[k] = seconds
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* private mode / quota — cosmetic stat, ignore */
  }
  return true
}

/** Seconds → "M:SS". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}
