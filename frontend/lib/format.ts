/**
 * The single source of truth for rendering dates, times, and numbers.
 *
 * Why this exists: the same date or count rendered two different ways on two
 * screens reads as "did something break?" — it quietly erodes trust. Before
 * this file, ~23 call sites each picked their own locale ("en-US", "en-IN",
 * "en-GB", or the browser default) and their own field order ("5 Jun" vs
 * "Jun 5"). This module makes that decision once.
 *
 * Standardization here is "one function + named presets", NOT "one format for
 * everything": a newsletter date (long) and a chip date (short) are genuinely
 * different contexts and may look different — but a given context looks the
 * same everywhere, always, because it routes through one preset.
 *
 * Locale split (each justified, both decided in this one place):
 *  - DATES/TIME → en-IN: day-first ("5 Jun"), 12-hour clock. Matches the India
 *    audience and the nav's existing en-IN usage.
 *  - COUNTS → en-US: Western thousands grouping ("1,20,000" lakhs would surprise
 *    on a global job count, so counts use "120,000").
 */

const DATE_LOCALE = "en-IN"
const NUMBER_LOCALE = "en-US"

export type DatePreset = "short" | "medium" | "long" | "weekday"

const DATE_PRESETS: Record<DatePreset, Intl.DateTimeFormatOptions> = {
  /** "5 Jun" — chips, comment timestamps, compact metadata. */
  short: { day: "numeric", month: "short" },
  /** "5 Jun 2026" — the default full date (lists, verdicts, exports). */
  medium: { day: "numeric", month: "short", year: "numeric" },
  /** "5 June 2026" — formal long form (newsletter). */
  long: { day: "numeric", month: "long", year: "numeric" },
  /** "Fri, 5 Jun" — day-of-week emphasis (mission rail). */
  weekday: { weekday: "short", day: "numeric", month: "short" },
}

const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
}

// Cached formatters — count formatting can run per animation frame.
const countFormatter = new Intl.NumberFormat(NUMBER_LOCALE)
const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

function toDate(input: string | number | Date): Date | null {
  const d = input instanceof Date ? input : new Date(input)
  return Number.isNaN(d.getTime()) ? null : d
}

/** A date, in one of the named presets. Invalid/missing input → "". */
export function formatDate(input: string | number | Date, preset: DatePreset = "medium"): string {
  const d = toDate(input)
  return d ? d.toLocaleDateString(DATE_LOCALE, DATE_PRESETS[preset]) : ""
}

/** Date + time, e.g. "5 Jun, 4:30 pm". Invalid/missing input → "". */
export function formatDateTime(input: string | number | Date): string {
  const d = toDate(input)
  return d ? d.toLocaleString(DATE_LOCALE, DATE_TIME_OPTIONS) : ""
}

/** An integer count with thousands grouping, e.g. "120,000". */
export function formatCount(n: number): string {
  return countFormatter.format(n)
}

/**
 * Human relative age for a timestamp (ms epoch), e.g. "just now", "5 minutes
 * ago", "2 hours ago", "3 days ago". Negative diff = past.
 */
export function formatRelativeAge(ts: number): string {
  const mins = Math.round((ts - Date.now()) / 60000)
  if (Math.abs(mins) < 1) return "just now"
  if (Math.abs(mins) < 60) return relativeFormatter.format(mins, "minute")
  const hours = Math.round(mins / 60)
  if (Math.abs(hours) < 24) return relativeFormatter.format(hours, "hour")
  return relativeFormatter.format(Math.round(hours / 24), "day")
}
