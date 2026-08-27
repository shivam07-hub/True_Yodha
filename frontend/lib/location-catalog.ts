/**
 * The job-corpus location catalog, and how a typed query hits it.
 *
 * Settings already searched `jobs.analytics()` city/country names. Myro Search
 * took the Where slot as free text, so typing a city produced no list. One
 * matcher, every surface that offers a city.
 *
 * Aliases mirror `backend/app/services/location_normalizer.py` `_CITY_ALIASES`
 * so "Gurgaon" finds "Gurugram" and "Bangalore" finds "Bengaluru". Keep them
 * in lockstep — a name the normalizer rewrites must still be findable here.
 */

export type LocationEntry = {
  name: string
  count: number
}

const CITY_ALIASES: Record<string, string> = {
  bangalore: "Bengaluru",
  bengaluru: "Bengaluru",
  hyderabad: "Hyderabad",
  pune: "Pune",
  mumbai: "Mumbai",
  chennai: "Chennai",
  noida: "Noida",
  gurgaon: "Gurugram",
  gurugram: "Gurugram",
  "new delhi": "Delhi NCR",
  delhi: "Delhi NCR",
  ncr: "Delhi NCR",
  kolkata: "Kolkata",
  ahmedabad: "Ahmedabad",
  jaipur: "Jaipur",
}

function variants(value: string): string[] {
  const lower = value.trim().toLowerCase()
  if (!lower) return []
  const canonical = (CITY_ALIASES[lower] ?? value).trim().toLowerCase()
  const out = new Set<string>([lower, canonical])
  for (const [alias, canon] of Object.entries(CITY_ALIASES)) {
    if (canon.toLowerCase() === canonical) out.add(alias)
  }
  return [...out]
}

export function locationMatches(entry: string, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const entryVars = variants(entry)
  if (entryVars.some((v) => v.includes(needle))) return true
  return variants(needle).some(
    (n) => n.length >= 2 && entryVars.some((v) => v.includes(n) || n.includes(v)),
  )
}

export function catalogFromAnalytics(data: {
  by_location_city?: { name: string; count: number }[] | null
  by_location_country?: { name: string; count: number }[] | null
} | null | undefined): LocationEntry[] {
  if (!data) return []
  const collect = (items: { name: string; count: number }[] | null | undefined) => {
    const seen = new Map<string, LocationEntry>()
    for (const item of items ?? []) {
      const name = item.name.trim()
      if (!name || name.toLowerCase() === "unknown") continue
      const key = name.toLowerCase()
      const prev = seen.get(key)
      if (!prev || item.count > prev.count) seen.set(key, { name, count: item.count })
    }
    return [...seen.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }
  const cities = collect(data.by_location_city)
  const cityKeys = new Set(cities.map((entry) => entry.name.toLowerCase()))
  const countries = collect(data.by_location_country).filter(
    (entry) => !cityKeys.has(entry.name.toLowerCase()),
  )
  return [...cities, ...countries]
}

export function suggestLocations(opts: {
  catalog: LocationEntry[]
  query: string
  chosen: string[]
  extras?: string[]
  limit?: number
}): LocationEntry[] {
  const chosen = new Set(opts.chosen.map((c) => c.trim().toLowerCase()).filter(Boolean))
  const extras = (opts.extras ?? [])
    .map((name) => name.trim())
    .filter((name) => name && !chosen.has(name.toLowerCase()) && locationMatches(name, opts.query))
    .map((name) => ({ name, count: 0 }))
  const extraKeys = new Set(extras.map((e) => e.name.toLowerCase()))
  const pool = opts.catalog.filter(
    (entry) =>
      !chosen.has(entry.name.toLowerCase()) &&
      !extraKeys.has(entry.name.toLowerCase()) &&
      locationMatches(entry.name, opts.query),
  )
  return [...extras, ...pool].slice(0, opts.limit ?? 10)
}
