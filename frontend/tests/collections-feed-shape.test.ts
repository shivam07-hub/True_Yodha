import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8")
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

test("Collections is a feed: 732 column, 316 rail on the right, peeks in that rail", () => {
  const desktop = code("components/collections/collections-desktop.tsx")
  const css = read("components/collections/collections.css")
  const tokens = read("app/design-tokens.css")
  const skel = read("components/loading/desktop-page-skeletons.tsx")

  assert.match(desktop, /tm-intel-page tm-feed-page/)
  assert.doesNotMatch(desktop, /maxWidth:\s*1480/)
  assert.doesNotMatch(desktop, /padding:\s*"32px 36px 64px"/)

  // Feed first, peeks second — the 316 column is a RIGHT rail, like r/popular.
  const main = desktop.indexOf('className="mc-ws-main"')
  const rail = desktop.indexOf("mc-ws-rail--peek")
  assert.ok(main > -1 && rail > main, "the peek rail must follow the feed")
  assert.match(desktop, /<FirstSuccessChecklist\b/)
  assert.match(desktop, /<PeekSurfaces\b/)
  assert.ok(desktop.indexOf("<PeekSurfaces") > rail)

  assert.match(tokens, /--tm-feed-col:\s*732px/)
  assert.match(tokens, /--tm-feed-rail:\s*316px/)
  assert.match(tokens, /minmax\(0,\s*var\(--tm-feed-col\)\)\s+var\(--tm-feed-rail\)/)

  assert.doesNotMatch(css, /font-size:\s*[0-9.]+px/)
  assert.doesNotMatch(css, /border-radius:\s*999px/)
  assert.doesNotMatch(css, /font-weight:\s*7/)
  assert.match(css, /--tm-button-radius/)
  assert.match(css, /--tm-radius-card/)

  // The bootstrap skeleton is the live frame, or the swap moves the page.
  assert.match(skel, /var\(--tm-feed-col\)/)
  assert.match(skel, /var\(--tm-feed-rail\)/)
  const skelMain = skel.indexOf("export function DashboardDesktopSkeleton")
  const skelFeed = skel.indexOf("<FeedRow", skelMain)
  const skelRail = skel.indexOf("<RailWidget", skelMain)
  assert.ok(skelFeed > skelMain && skelRail > skelFeed, "skeleton feed precedes the right rail")
})
