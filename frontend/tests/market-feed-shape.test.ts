import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8")
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

test("Market is a feed: 732 column, 316 rail on the right", () => {
  const page = code("app/(authed)/market/page.tsx")
  const frame = code("components/market/market-feed-frame.tsx")
  const intel = code("components/market/market-intel.css")
  const tokens = read("app/design-tokens.css")
  const skel = code("components/loading/desktop-page-skeletons.tsx")
  const mc = code("app/(authed)/home/mission-control.css")

  assert.match(page, /tm-intel-page tm-feed-page/)
  assert.doesNotMatch(page, /maxWidth:\s*1480/)
  assert.doesNotMatch(page, /padding:\s*"32px 36px 64px"/)

  // Feed first, greeting + intel second — the 316 column is a RIGHT rail.
  const main = frame.indexOf('className="mc-ws-main"')
  const rail = frame.indexOf("tm-market-rail")
  assert.ok(main > -1 && rail > main, "the market rail must follow the feed")
  assert.match(page, /railHead=/)
  assert.match(page, /<MissionHeroRail\b/)
  assert.ok(page.indexOf("<MissionHeroRail") > page.indexOf("railHead="))
  assert.match(code("components/market/jobs-tab.tsx"), /<MarketRail\b/)

  // Nested 640+320 inside the feed column would recreate the 1480 shell.
  assert.doesNotMatch(intel, /minmax\(0,\s*640px\)\s+320px/)
  assert.doesNotMatch(intel, /tm-market-layout/)
  assert.doesNotMatch(code("components/market/jobs-tab.tsx"), /tm-market-layout/)
  assert.doesNotMatch(code("components/market/market.css"), /max-width:\s*680px/)

  assert.match(tokens, /--tm-feed-col:\s*732px/)
  assert.match(tokens, /--tm-feed-rail:\s*316px/)
  assert.match(tokens, /minmax\(0,\s*var\(--tm-feed-col\)\)\s+var\(--tm-feed-rail\)/)

  // Default workspace rail stays 248 — Prep and anything unconverted still
  // read it. Market scopes 732+316 via .tm-feed-page, like Collections.
  assert.match(mc, /grid-template-columns:\s*248px minmax\(0,\s*1fr\)/)

  const skelFn = skel.indexOf("export function MarketDesktopSkeleton")
  const skelEnd = skel.indexOf("export function IntelDesktopSkeleton")
  const marketSkel = skel.slice(skelFn, skelEnd)
  assert.match(marketSkel, /var\(--tm-feed-col\)/)
  assert.match(marketSkel, /var\(--tm-feed-rail\)/)
  assert.doesNotMatch(marketSkel, /1480/)
  assert.doesNotMatch(marketSkel, /248px/)
  const skelFeed = marketSkel.indexOf("<FeedRow")
  const skelRail = marketSkel.indexOf("RailWidget")
  assert.ok(skelFeed > -1 && skelRail > skelFeed, "skeleton feed precedes the right rail")
})
