import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8")

const probe = read("components/loading/route-loading/route-perf-probe.tsx")
const rootLayout = read("app/layout.tsx")
const barrel = read("components/loading/route-loading/index.tsx")

/**
 * `route_perf_events` has never held a row, and could not have.
 *
 * The old `use-route-perf-marks` was dead three ways at once, and each way on
 * its own was enough to guarantee zero rows:
 *
 *   1. nothing imported it;
 *   2. it sent with `navigator.sendBeacon`, which cannot carry an
 *      Authorization header, at an endpoint that requires one;
 *   3. `ttfa_ms` was `performance.now()` — time since PAGE LOAD, not since the
 *      route change, so every client-side navigation reported the age of the
 *      session instead of the wait.
 *
 * Each test below pins one of those. They are the only reason a rebuilt pipe
 * is worth more than the one it replaces.
 */

test("the dead hook is gone, not left beside its replacement", () => {
  assert.ok(
    !existsSync(resolve(process.cwd(), "components/loading/route-loading/use-route-perf-marks.ts")),
    "two probes for one number is how they drift",
  )
  assert.doesNotMatch(barrel, /useRoutePerfMarks/)
})

test("the probe is actually mounted", () => {
  // Defect 1. An instrument nobody calls reports nothing, for ever, silently.
  assert.match(rootLayout, /<RoutePerfProbe \/>/, "the probe is not mounted")
  assert.match(rootLayout, /import \{ RoutePerfProbe \}/)
})

test("it is mounted above the route groups, so /onboarding is covered", () => {
  // The journey starts outside (authed). Mounting in the authed shell would
  // miss the two steps where users actually stall.
  assert.match(probe, /"\/onboarding"/, "the onboarding journey is not watched")
})

test("it authenticates, and never uses sendBeacon", () => {
  // Defect 2. sendBeacon cannot set headers; the endpoint requires a principal.
  // Making the endpoint public was the wrong half to change — attribution is
  // what ties a wait to a user, a network and a cohort, and what the
  // test-account exclusion needs to keep persona traffic out of the numbers.
  // The CALL, not the word: the explanation above names sendBeacon, and a bare
  // -name grep would fail on its own prose.
  assert.doesNotMatch(
    probe,
    /navigator\.sendBeacon\(/,
    "a beacon cannot authenticate; every send would 401",
  )
  assert.match(probe, /Authorization: `Bearer \$\{token\}`/)
  assert.match(probe, /keepalive: true/, "an unload-time send needs keepalive")
})

test("the wait is measured from the navigation, not from page load", () => {
  // Defect 3. `performance.now()` alone is the age of the session.
  assert.match(probe, /startedAt/, "no navigation origin is recorded")
  assert.match(
    probe,
    /performance\.now\(\) - started/,
    "ttfa is not measured relative to the navigation that caused it",
  )
})

test("it measures after paint, not before it", () => {
  // One frame fires before the browser paints this commit. Measuring there
  // reports layout time and calls it a wait the user never had.
  const frames = probe.match(/requestAnimationFrame/g) ?? []
  assert.ok(frames.length >= 2, "a single rAF still lands before paint")
})

test("it records the connection the wait happened on", () => {
  // ~10% of uploaders are on 3G/2G. Without this a slow network and a slow
  // route are the same row, and the fix for one is wasted on the other.
  assert.match(probe, /network_type: networkType\(\)/)
  assert.match(probe, /effectiveType/)
})

test("telemetry can never fail the journey it watches", () => {
  assert.match(probe, /\.catch\(\(\) => \{\}\)/, "a failed beacon must not surface to the user")
})

test("production is sampled", () => {
  assert.match(probe, /NODE_ENV === "production" \? 0\.1 : 1\.0/)
})
