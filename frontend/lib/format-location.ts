/**
 * Build a human location label from a job's location fields.
 *
 * De-duplicates repeated parts case-insensitively so bad upstream scraper data
 * — where `location_city` is set to the country name (e.g. both "India") — never
 * renders as "India, India". Also normalises an explicit `location` string that
 * already carries duplicated comma-separated parts.
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
