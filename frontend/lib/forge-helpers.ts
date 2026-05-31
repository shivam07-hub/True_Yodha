export interface SkillDelta {
  taxonomy_key: string
  xp_added: number
}

export interface DiaryEntry {
  id: string
  log_date: string
  entry_text: string
  score_before: number | null
  score_after: number | null
  skills_delta: SkillDelta[]
}

export function daysAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
  if (diff === 0) return "today"
  if (diff === 1) return "1d"
  return `${diff}d`
}

export function computeStreak(entries: DiaryEntry[]): number {
  return computeStreakFromDates(entries.map((e) => e.log_date))
}

/**
 * Consecutive-day streak from a list of ISO datetimes/dates (any order).
 * Powers the home "practice streak" off forge sessions — the diary streak was
 * retired when the diary rail moved off Practice (Comments PR).
 */
export function computeStreakFromDates(isoDates: string[]): number {
  const days = new Set(isoDates.map((d) => d.slice(0, 10)))
  let streak = 0
  const d = new Date()
  while (true) {
    const key = d.toISOString().slice(0, 10)
    if (!days.has(key)) break
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

export function computeTotalXP(entries: DiaryEntry[]): number {
  return entries.reduce(
    (sum, e) => sum + e.skills_delta.reduce((s, delta) => s + delta.xp_added, 0),
    0,
  )
}

export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function getWeekDates(): Date[] {
  const today = new Date()
  const day = today.getDay() === 0 ? 6 : today.getDay() - 1
  const monday = new Date(today)
  monday.setHours(12, 0, 0, 0)
  monday.setDate(today.getDate() - day)
  return Array.from({ length: 7 }, (_, i) => {
    const next = new Date(monday)
    next.setDate(monday.getDate() + i)
    return next
  })
}
