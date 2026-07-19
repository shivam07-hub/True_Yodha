/* Display rules for the public (no-auth) corpus counters.
 *
 * Lives in a plain module — NOT inside a "use client" file — because both the
 * client landing page and the server-rendered newsletter rail must floor the
 * same numbers the same way. One source, or the two surfaces drift and a
 * visitor sees a different "jobs tracked" on /newsletter than on /.
 */

/* Static floors — verified Engine-corpus values confirmed in the design handoff
   (DEC-L2). Rendered whenever live data is unavailable; live values are floored
   so the public numbers only ever grow. These describe the SCRAPED CORPUS (jobs,
   companies, skills) — real engine scale, safe to floor.
   NOTE: there is deliberately NO `seekers` floor here. The user count is real-
   but-small (<400) and must never be inflated into fake social proof (PV1 /
   no-fabrication). It is env-gated, not floored. */
export const LANDING_FLOORS = {
  jobs: 4000,
  companies: 150,
  skills: 32000,
} as const

export function floorTo(n: number, step: number): number {
  return Math.floor(n / step) * step
}

/** Floored live value, never below the verified static floor. */
export function displayCount(live: number | null | undefined, floor: number, step: number): number {
  if (typeof live === "number" && Number.isFinite(live) && live > 0) {
    return Math.max(floor, floorTo(live, step))
  }
  return floor
}
