/**
 * Build a human location label from a job's location fields.
 *
 * A job with a country but no real city (including legacy rows whose
 * `location_city` is the country) renders "India — city not specified". An
 * explicit `location` string is the scraper's display label and is kept,
 * with duplicated comma-separated parts collapsed.
 *
 * Returns `null` when nothing usable exists. Callers choose their own fallback
 * (e.g. "Location unknown" on the job card, hide the chip on the feed).
 */
export function formatJobLocation(input: {
  location?: string | null
  city?: string | null
  country?: string | null
}): string | null {
  const explicit = (input.location ?? "").trim()
  if (!explicit) {
    // A country is never a city (CEO decision 2026-10-04): a job with no real
    // city says so instead of reading as a bare "India".
    const country = (input.country ?? "").trim()
    let city = (input.city ?? "").trim()
    if (city && country && city.toLowerCase() === country.toLowerCase()) city = ""
    if (!city && country) return `${country} — city not specified`
  }
  const parts = explicit
    ? explicit.split(",").map((part) => part.trim())
    : [input.city ?? "", input.country ?? ""]

  const seen = new Set<string>()
  const deduped: string[] = []
  for (const part of parts) {
    const value = part.trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(value)
  }

  return deduped.length ? deduped.join(", ") : null
}
