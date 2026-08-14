import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { interleaveStories } from "../components/market/feed-rows"
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

test("browse expansion and Undo follow the locked contract", () => {
  const hook = readFileSync(new URL("../components/market/use-job-feed.ts", import.meta.url), "utf8")
  const css = readFileSync(new URL("../components/market/market.css", import.meta.url), "utf8")
  assert.match(hook, /exact: "remote_country"/)
  assert.match(hook, /remote_country: "country"/)
  assert.match(hook, /const UNDO_MS = 6000/)
  assert.match(css, /bottom: calc\(env\(safe-area-inset-bottom, 0px\) \+ 24px\)/)
  assert.match(css, /\+ 84px/)
})

test("Jobs paints its J0 feed before secondary compute", () => {
  const hook = readFileSync(new URL("../components/market/use-job-feed.ts", import.meta.url), "utf8")
  const page = readFileSync(new URL("../app/(authed)/market/page.tsx", import.meta.url), "utf8")
  const rail = readFileSync(new URL("../components/market/market-rail.tsx", import.meta.url), "utf8")
  const demand = readFileSync(new URL("../components/market/skill-demand-panel.tsx", import.meta.url), "utf8")
  const bell = readFileSync(new URL("../components/nav/notification-bell.tsx", import.meta.url), "utf8")
  const mobileShell = readFileSync(new URL("../mobile/shell.tsx", import.meta.url), "utf8")
  const navUnlocks = readFileSync(new URL("../lib/hooks/use-nav-unlocks.ts", import.meta.url), "utf8")
  assert.doesNotMatch(hook, /jobs\.warmFeed/)
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
  // Only under "Best fit". Warming under "Newest" spends a judgment-lane call on
  // an order the user did not ask for and that no longer reorders anyway.
  assert.match(warm, /filters\.sort !== "fit"/)
  // Warming nothing must not trigger a re-read.
  assert.match(warm, /res\.warmed > 0/)

  // BOTH skins warm through the same hook — a surface that warmed its own way is
  // how desktop and mobile drifted apart before.
  assert.match(desktop, /useFeedWarm\(/)
  assert.match(mobile, /useFeedWarm\(/)
})
