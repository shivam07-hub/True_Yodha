import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { interleaveStories } from "../components/market/feed-rows"
import { unreadBoundary } from "../lib/jobs/track-sections"
import type { JobFeedItem } from "../lib/api"

const jobs = ["exact", "remote", "country"].map((job_id) => ({ job_id } as JobFeedItem))

test("location expansion dividers sit before their first broader job", () => {
  const rows = interleaveStories(jobs, [], [
    { beforeJobId: "remote", label: "More remote roles in India" },
    { beforeJobId: "country", label: "More roles in India" },
  ])
  assert.deepEqual(rows.map((row) => row.t), ["job", "divider", "job", "divider", "job"])
  assert.equal(rows[1]?.t === "divider" && rows[1].label, "More remote roles in India")
})

/**
 * The virtual feed caches each row's MEASURED HEIGHT by key and positions rows
 * absolutely from those heights. Rows are spliced in mid-list AFTER first paint
 * — a story card when market intel resolves, a scope divider when the ranked
 * count arrives, a row removed on skip — so a key that tracks POSITION hands
 * every row below the splice its neighbour's height, and cards paint on top of
 * each other (a "Hiring now" card across a job card, 2026-08-24).
 *
 * Two halves hold that line. VirtualFeed forwards the same key to React and to
 * the virtualizer's `getItemKey` (ratcheted in scripts/ui-drift-guard.mjs as
 * `virtualRowIdentity`). And the key the feeds hand it has to BE an identity —
 * that half is here.
 */
test("a spliced row shifts every position below it, and no key moves with them", () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ job_id: `id-${i}` } as JobFeedItem))
  const story = { kind: "company" as const, company: "Genpact", openCount: 199, location: "Gurugram", followed: false }
  const keyOf = (row: ReturnType<typeof interleaveStories>[number]) => (row.t === "job" ? row.job.job_id : row.id)

  const before = interleaveStories(many, [], [])
  const after = interleaveStories(many, [story], [{ beforeJobId: "id-2", label: "More roles in Gurugram" }])

  // Same eight jobs, four positions further down the list.
  assert.equal(before.length + 2, after.length)
  assert.equal(before.findIndex((r) => keyOf(r) === "id-7"), 7)
  assert.equal(after.findIndex((r) => keyOf(r) === "id-7"), 9)

  // Every job still answers to the same key, in the same order.
  assert.deepEqual(before.filter((r) => r.t === "job").map(keyOf), after.filter((r) => r.t === "job").map(keyOf))
  // And no two rows share one — a collision is one cached height for two rows.
  const keys = after.map(keyOf)
  assert.equal(new Set(keys).size, keys.length)
})

test("both feeds key virtual rows by row identity, never by index", () => {
  for (const file of ["../components/market/market-jobs-column.tsx", "../components/market/mobile-feed.tsx"]) {
    const src = readFileSync(new URL(file, import.meta.url), "utf8")
    const getKey = src.match(/getKey=\{([^}]*\})?[^}]*\}/)?.[0] ?? ""
    assert.match(getKey, /job\.job_id/, `${file}: a job row must be keyed by job_id`)
    assert.match(getKey, /row\.id/, `${file}: a story/divider row must be keyed by its own id`)
    assert.doesNotMatch(getKey, /\bi(ndex)?\b/, `${file}: a virtual row key must not be derived from its index`)
  }
})

test("the list is finite, and Undo follows the locked contract", () => {
  const hook = readFileSync(new URL("../components/market/use-job-feed.ts", import.meta.url), "utf8")
  const css = readFileSync(new URL("../components/market/market.css", import.meta.url), "utf8")
  // The three-tier expansion ladder is gone. It existed because the feed ran dry,
  // and it ran dry because it filtered a 500-row sample of one shared date —
  // retrieval searches the whole corpus per user now, so there is one page.
  assert.doesNotMatch(hook, /remote_country/)
  assert.doesNotMatch(hook, /useInfiniteQuery|fetchNextPage/)
  assert.match(hook, /const UNDO_MS = 6000/)
  assert.match(css, /bottom: calc\(env\(safe-area-inset-bottom, 0px\) \+ 24px\)/)
  assert.match(css, /\+ 84px/)
})

test("a list never presents unread rows as ranked", () => {
  // Was "Jobs paints its J0 feed before secondary compute", whose load-bearing
  // assertion was that the warm is absent from the feed hook. That absence —
  // and the 7s POST that replaced it and then gave up — left retrieval order
  // on screen with ranked_count 0 and no divider, which is an unranked list
  // presented as ranked (prod 2026-09-25). The warm is a Background Job now.
  // This test locks the list's half: zero read rows draw "Not read yet"
  // before the first card, on both skins, and the client no longer races the
  // judgment call.
  const unread = ["a", "b"].map((job_id) => ({ job_id } as JobFeedItem))
  assert.deepEqual(unreadBoundary(unread, 0), [
    { beforeJobId: "a", label: "Not read yet", kind: "tier" },
  ])
  assert.deepEqual(unreadBoundary(unread, 1), [])
  assert.deepEqual(unreadBoundary([], 0), [])

  const desktop = readFileSync(new URL("../components/market/jobs-tab.tsx", import.meta.url), "utf8")
  const mobile = readFileSync(new URL("../mobile/redesign/jobs-surface.tsx", import.meta.url), "utf8")
  assert.match(desktop, /unreadBoundary\(/)
  assert.match(mobile, /unreadBoundary\(/)

  const api = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8")
  const warmFn = api.slice(api.indexOf("warmFeed:"), api.indexOf("agentPicks:"))
  assert.doesNotMatch(warmFn, /timeoutMs/)
  assert.doesNotMatch(warmFn, /warmed: 0/)

  const page = readFileSync(new URL("../app/(authed)/market/page.tsx", import.meta.url), "utf8")
  const rail = readFileSync(new URL("../components/market/market-rail.tsx", import.meta.url), "utf8")
  const demand = readFileSync(new URL("../components/market/skill-demand-panel.tsx", import.meta.url), "utf8")
  const bell = readFileSync(new URL("../components/nav/notification-bell.tsx", import.meta.url), "utf8")
  const mobileShell = readFileSync(new URL("../mobile/shell.tsx", import.meta.url), "utf8")
  const navUnlocks = readFileSync(new URL("../lib/hooks/use-nav-unlocks.ts", import.meta.url), "utf8")
  // J0 still paints before the enqueue. The warm stays out of the feed hook;
  // what changed is that its absence is no longer the whole contract.
  assert.doesNotMatch(page, /useIntentWave|pointerdown|keydown/)
  assert.match(page, /const heroEnabled = j0Settled/)
  assert.match(page, /const demandEnabled = heroSettled/)
  assert.match(page, /const analyticsEnabled = demandSettled/)
  assert.match(page, /const chipCountsEnabled = mode === "mobile" \? profileSettled : marketIntelSettled/)
  assert.match(page, /useFeedState\(j0Settled\)/)
  assert.match(page, /token={heroEnabled \? token : null}/)
  assert.match(demand, /if \(!enabled\) return <SkillDemandLoading \/>/)
  assert.match(rail, /!analyticsEnabled \|\| intelLoading/)
  assert.match(bell, /enabled: !!token && open/)
  assert.doesNotMatch(bell, /notificationsApi\.unreadCount/)
  assert.match(bell, /inbox\.data\?\.unread_count/)
  assert.match(mobileShell, /queryKey: dataKeys\.applications\(\)[\s\S]*?enabled: false/)
  assert.doesNotMatch(navUnlocks, /cv\.versions\.list/)
})

test("Not interested is persistent and recoverable", () => {
  const card = readFileSync(new URL("../components/market/job-card.tsx", import.meta.url), "utf8")
  const hidden = readFileSync(new URL("../components/market/hidden-jobs-dialog.tsx", import.meta.url), "utf8")
  assert.match(card, /Not interested/)
  assert.match(hidden, /Hidden jobs/)
  assert.match(hidden, /jobs\.unskipJob/)
})

test("new-tab job browsing retains the same-origin session", () => {
  const browseControls = [
    "components/onboarding/analysis-progress.tsx",
    "components/onboarding/experience-step.tsx",
    "components/cv/cv-structured-recovery.tsx",
  ].map((path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8"))

  for (const control of browseControls) {
    assert.match(control, /href=\"\/market\"/)
    assert.match(control, /target=\"_blank\"/)
    assert.match(control, /rel=\"opener\"/)
    assert.doesNotMatch(control, /rel=\"noopener noreferrer\"/)
  }

  const session = readFileSync(new URL("../lib/session.ts", import.meta.url), "utf8")
  const auth = readFileSync(new URL("../lib/hooks/use-auth.ts", import.meta.url), "utf8")
  assert.match(session, /window\.opener = null/)
  assert.match(auth, /detachSameOriginOpener\(\)/)
})

test("the brain warm is deferred to J1 and lives outside the feed hook", () => {
  const hook = readFileSync(new URL("../components/market/use-job-feed.ts", import.meta.url), "utf8")
  const warm = readFileSync(new URL("../components/market/use-feed-warm.ts", import.meta.url), "utf8")
  const desktop = readFileSync(new URL("../components/market/jobs-tab.tsx", import.meta.url), "utf8")
  const mobile = readFileSync(new URL("../mobile/redesign/jobs-surface.tsx", import.meta.url), "utf8")

  // The J0 guard still holds: no warm on the arrival path.
  assert.doesNotMatch(hook, /jobs\.warmFeed/)
  // ...and the dead `warming: false` key it left behind is gone.
  assert.doesNotMatch(hook, /warming: false/)

  // The warm gates on J0 having SETTLED, not on a timer or browser idle —
  // ARCHITECTURE_READ_PATH: "the browser is idle" is not a user decision.
  assert.match(warm, /settled/)
  // Calls, not prose: no timer or removed page-idle gate may own this transition.
  assert.doesNotMatch(warm, /useIdleWave\(|setTimeout\(/)
  // It no longer gates on a sort lens, because there is no lens: the warm calls the
  // same retrieval the list does, so it ranks exactly the cards on screen.
  assert.doesNotMatch(warm, /filters\./)
  assert.match(warm, /warmFeed\(token, ac\.signal\)/)
  // The POST reports that a job is in flight. It does not report how many
  // rows it ranked — it ranked none. A re-read keys off `pending`.
  assert.match(warm, /res\.pending/)
  assert.doesNotMatch(warm, /res\.warmed/)

  // BOTH skins warm through the same hook — a surface that warmed its own way is
  // how desktop and mobile drifted apart before.
  assert.match(desktop, /useFeedWarm\(/)
  assert.match(mobile, /useFeedWarm\(/)
})

test("a live match run yields every J1/J2 Market fetch", () => {
  const store = readFileSync(new URL("../store/matchRunStore.ts", import.meta.url), "utf8")
  const warm = readFileSync(new URL("../components/market/use-feed-warm.ts", import.meta.url), "utf8")
  const feed = readFileSync(new URL("../components/market/use-job-feed.ts", import.meta.url), "utf8")
  const pulses = readFileSync(new URL("../lib/hooks/use-pulses.ts", import.meta.url), "utf8")
  const demand = readFileSync(new URL("../lib/hooks/use-skill-demand.ts", import.meta.url), "utf8")
  const intel = readFileSync(new URL("../lib/hooks/use-market-intel.ts", import.meta.url), "utf8")
  const feedState = readFileSync(new URL("../lib/hooks/use-feed-state.ts", import.meta.url), "utf8")
  const refresh = readFileSync(new URL("../lib/hooks/use-job-refresh.ts", import.meta.url), "utf8")
  const gate = readFileSync(new URL("../components/preflight/preflight-gate.tsx", import.meta.url), "utf8")
  const list = readFileSync(new URL("../../backend/app/routers/jobs/list.py", import.meta.url), "utf8")
  const warmPy = readFileSync(new URL("../../backend/app/services/matching/feed_warm.py", import.meta.url), "utf8")

  assert.match(store, /export function useLaneYields/)
  assert.match(store, /s\.ranking \|\| s\.hold/)

  for (const [name, src] of [
    ["warm", warm],
    ["feed", feed],
    ["pulses", pulses],
    ["demand", demand],
    ["intel", intel],
    ["feedState", feedState],
  ] as const) {
    assert.match(src, /useLaneYields/, `${name} must yield to a live match run`)
  }

  // A yielded warm must retry after ranking; recording the key before the
  // call is how a yielded warm never ran again. `pending` is the accept.
  assert.match(warm, /if \(yieldLane/)
  assert.match(warm, /res\.pending/)
  assert.doesNotMatch(warm, /res\.warmed/)
  assert.match(warm, /attempted\.current\.add\(signature\)/)
  const attemptedAt = warm.indexOf("attempted.current.add(signature)")
  const yieldAt = warm.indexOf("if (yieldLane")
  assert.ok(yieldAt >= 0 && attemptedAt > yieldAt, "do not mark a warm attempted before it can yield")

  assert.doesNotMatch(refresh, /invalidateQueries/)
  assert.match(gate, /setHold\(open && \(starting \|\| mode === "running" \|\| mode === "done"\)\)/)
  assert.match(gate, /queryKey: \["jobFeed"\]/)
  assert.match(gate, /releaseAfterRun/)

  assert.match(list, /user_has_live_refresh/)
  assert.match(list, /feed_warm.yielded/)
  assert.match(warmPy, /user_has_live_refresh/)
  assert.match(warmPy, /stage=pre_eval/)
})
