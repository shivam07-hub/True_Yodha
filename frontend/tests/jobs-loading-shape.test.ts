import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8")

test("Jobs hero loading mirrors CommandRail, not the deleted wide hero", () => {
  const hero = read("components/mission-control/hero-loading.tsx")
  const rail = read("components/mission-control/mission-hero-rail.tsx")
  const bootstrap = read("components/loading/page-skeletons.tsx")
  assert.match(hero, /className="mc-rail cmd-rail"/)
  assert.match(hero, /width:\s*68,\s*height:\s*68/)
  assert.doesNotMatch(hero, /mc-hero/)
  assert.doesNotMatch(hero, /width:\s*168,\s*height:\s*168/)
  assert.doesNotMatch(rail, /TealField/)
  assert.doesNotMatch(bootstrap, /width:\s*168,\s*height:\s*168/)
})

test("feed-card skeleton occupies the live row: tile, fit ring, actions", () => {
  const card = read("components/jobs/feed-card.tsx")
  const skeleton = card.slice(card.indexOf("export function FeedCardSkeleton"))
  assert.match(skeleton, /className="fc-card fc-row"/)
  assert.match(skeleton, /className="fc-fit"/)
  assert.match(skeleton, /className="fc-actions"/)
  assert.match(skeleton, /width:\s*34,\s*height:\s*34/)
  assert.doesNotMatch(skeleton, /width:\s*42,\s*height:\s*42/)
})

test("authed avatar never prints a fake HM identity", () => {
  const strip = read("components/shell/authed-top-strip.tsx")
  assert.doesNotMatch(strip, /["']HM["']/)
  assert.match(strip, /profileLoading/)
  assert.match(strip, /Skeleton/)
})

test("dark skeleton ink is a visible shape, not the card surface", () => {
  const tokens = read("app/design-tokens.css")
  const lightAt = tokens.search(/^:root\[data-surface="light"\]/m)
  const inkAt = tokens.search(/^html:root:has\(\.tm-ink\)/m)
  assert.ok(lightAt > 0 && inkAt > lightAt)
  const dark = tokens.slice(0, lightAt)
  const ink = tokens.slice(inkAt)
  assert.match(dark, /--tm-skeleton:\s*#3a3a36/)
  assert.doesNotMatch(dark, /--tm-skeleton:\s*#232322/)
  assert.match(ink, /--tm-skeleton:\s*#1c2a44/)
  assert.doesNotMatch(ink, /--tm-skeleton:\s*#0f1a2e/)
})
