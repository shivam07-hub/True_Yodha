/**
 * Where the feed is looking.
 *
 * ONE answer to "which places is this user's feed scoped to". Every surface that
 * names a place reads it from here: the scope pill, the "More roles in X"
 * divider, the market rail's city, the skill-demand panel's home city, the
 * mobile count line, the heatmap label, the feed cache key.
 *
 * It exists because that derivation was copy-pasted nine times and had already
 * drifted. Eight sites took the first NON-BLANK saved location; the heatmap took
 * `targetLocations[0]` raw. A profile whose first saved location was blank
 * therefore labelled the heatmap with an empty string while every other surface
 * said "Gurugram" — and nothing in the type system could see the disagreement.
 *
 * Geo is settings-owned (the feed scopes server-side to saved target locations,
 * never per-session — `_resolve_feed_scope` in backend/app/routers/jobs/list.py).
 * This module is the client's read model of that server truth, so it derives and
 * never sets. Anything that wants to CHANGE scope goes through Settings.
 */

export interface FeedScope {
  /** Saved locations, whitespace-cleaned, order preserved. Empty = unscoped. */
  cities: string[]
  /**
   * The single city market reads key on — skill demand, companies-at, the feed
   * divider. Null when nothing is saved, which means no surface may name a city.
   */
  city: string | null
  /** What a surface prints: "Gurugram", "Gurugram +2", or "All locations". */
  label: string
  /** Cache-key signature: order-independent and case-insensitive, so re-saving
   *  the same cities in a different order must not evict the feed. */
  signature: string
  /** Nothing saved — the feed is countrywide and the label carries no city. */
  isEmpty: boolean
}

/** Scope with nothing saved. A module-level constant so `feedScope([])` returns
 *  a stable reference (an inline literal would remint every render and loop any
 *  effect that lists the scope in its dependency array). */
export const EMPTY_FEED_SCOPE: FeedScope = {
  cities: [],
  city: null,
  label: "All locations",
  signature: "",
  isEmpty: true,
}

export function feedScope(targetLocations: readonly string[] | null | undefined): FeedScope {
  const cities = (targetLocations ?? [])
    .filter((location) => location && location.trim())
    .map((location) => location.trim())
  if (cities.length === 0) return EMPTY_FEED_SCOPE
  return {
    cities,
    city: cities[0],
    label: cities.length === 1 ? cities[0] : `${cities[0]} +${cities.length - 1}`,
    signature: cities.map((city) => city.toLowerCase()).sort().join("|"),
    isEmpty: false,
  }
}
