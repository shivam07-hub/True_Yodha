/**
 * Hunt facts on a job card: one logistics strip, never a career-band pile.
 *
 * MNC career-page roles: city · mode · pay · years.
 * Internships: city · mode · stipend/mo · duration · PPO.
 * Nulls drop out. The strip is what a student compares with, so internships
 * speak stipend, not lakhs.
 */
export const MODE_LABEL: Record<string, string> = {
  onsite: "On-site",
  hybrid: "Hybrid",
  remote: "Remote",
}

export type ListingVenue = "career_page" | "myro"
export type EmploymentKind = "full_time" | "internship"
export type LogisticsKind = "location" | "mode" | "pay" | "years" | "stipend" | "duration" | "ppo"

export interface LogisticsItem {
  kind: LogisticsKind
  label: string
  tone?: "warning"
}

export interface LogisticsInput {
  role?: string | null
  locations?: string[]
  location?: string | null
  locationMode?: string | null
  seniority?: string | null
  employmentKind?: string | null
  listingVenue?: string | null
  minYears?: number | null
  maxYears?: number | null
  pay?: { label: string; estimated?: boolean; belowFloor?: boolean } | null
  stipendLowInr?: number | null
  stipendHighInr?: number | null
  durationMonths?: number | null
  ppo?: boolean | null
}

export function listingVenueOf(value: string | null | undefined): ListingVenue {
  return value === "myro" ? "myro" : "career_page"
}

export function isInternRole(input: Pick<
  LogisticsInput,
  "role" | "seniority" | "employmentKind" | "stipendLowInr" | "stipendHighInr"
>): boolean {
  if (input.employmentKind === "internship") return true
  if ((input.seniority ?? "").toLowerCase() === "intern") return true
  if ((input.stipendLowInr ?? 0) > 0 || (input.stipendHighInr ?? 0) > 0) return true
  return /\bintern(?:ship)?\b/i.test(input.role ?? "")
}

export function stipendLabel(
  low: number | null | undefined,
  high: number | null | undefined,
): string | null {
  if (low == null && high == null) return null
  const a = low ?? high ?? 0
  const b = high ?? low ?? 0
  if (a <= 0 && b <= 0) return null
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  if (lo >= 1000 && hi >= 1000) {
    const fmtK = (n: number) => {
      const k = n / 1000
      return Number.isInteger(k) ? String(k) : k.toFixed(1)
    }
    const band = lo === hi ? `₹${fmtK(lo)}K` : `₹${fmtK(lo)}–${fmtK(hi)}K`
    return `${band}/mo`
  }
  const band = lo === hi ? `₹${lo}` : `₹${lo}–${hi}`
  return `${band}/mo`
}

export function durationLabel(months: number | null | undefined): string | null {
  if (months == null || months <= 0) return null
  return months === 1 ? "1 mo" : `${months} mo`
}

/** Compact relative-age badge from an ISO date (day granular). */
export function ageLabel(iso: string | null | undefined): string | null {
  if (!iso) return null
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return null
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000)
  if (days <= 0) return "today"
  if (days === 1) return "1d ago"
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

/** Experience-range chip label from the scraper's min/max years. */
export function experienceLabel(min: number | null, max: number | null): string | null {
  if (min != null && max != null) return min === max ? `${min} yrs` : `${min}–${max} yrs`
  if (min != null) return `${min}+ yrs`
  if (max != null) return `≤${max} yrs`
  return null
}

export function isFreshAge(iso: string | null | undefined): boolean {
  const label = ageLabel(iso)
  return label === "today" || label === "1d ago"
}

export function logisticsOf(input: LogisticsInput): LogisticsItem[] {
  const intern = isInternRole(input)
  const items: LogisticsItem[] = []
  const city = firstCity(input)
  if (city) items.push({ kind: "location", label: city })
  const mode = modeLabel(input.locationMode, city)
  if (mode) items.push({ kind: "mode", label: mode })
  if (intern) {
    const stipend = stipendLabel(input.stipendLowInr, input.stipendHighInr)
    if (stipend) items.push({ kind: "stipend", label: stipend })
    const duration = durationLabel(input.durationMonths)
    if (duration) items.push({ kind: "duration", label: duration })
    if (input.ppo === true) items.push({ kind: "ppo", label: "PPO" })
    return items
  }
  if (input.pay?.label) {
    items.push({
      kind: "pay",
      label: input.pay.label,
      tone: input.pay.belowFloor ? "warning" : undefined,
    })
  }
  const years = experienceLabel(input.minYears ?? null, input.maxYears ?? null)
  if (years) items.push({ kind: "years", label: years })
  return items
}

function firstCity(input: LogisticsInput): string | null {
  const fromList = (input.locations ?? []).map((c) => c.trim()).find(Boolean)
  if (fromList) return fromList
  const loc = input.location?.trim()
  return loc || null
}

function modeLabel(mode: string | null | undefined, city: string | null): string | null {
  if (!mode || mode === "unknown") return null
  if (city && city.toLowerCase().includes(mode.toLowerCase())) return null
  return MODE_LABEL[mode] ?? null
}
