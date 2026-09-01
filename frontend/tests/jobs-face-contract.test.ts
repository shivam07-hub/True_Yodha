import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")

/** One Jobs face: the ring is the judge, Save is the hero, CHECK DETAILS is
 *  posting-trust. Grade and a move sentence were a second "how good" and a
 *  second CTA on the same card. */

test("the Jobs card does not put grade next to the verdict ring", () => {
  const card = read("../components/market/job-card.tsx")
  assert.doesNotMatch(card, /GradeBadge/)
  assert.match(card, /LegitimacyBadge/)
})

test("the market adapter does not mint a move line", () => {
  const view = read("../lib/jobs/card-view.ts")
  assert.doesNotMatch(view, /marketMove/)
  assert.doesNotMatch(view, /verdictMove/)
  const feed = read("../components/jobs/feed-card.tsx")
  assert.doesNotMatch(feed, /fc-move/)
})

test("the phone Jobs row does not reprint grade or a move sentence", () => {
  const model = read("../mobile/redesign/job-model.ts")
  const feedFn = model.slice(model.indexOf("export function feedItemToRow"))
  const body = feedFn.slice(0, feedFn.indexOf("export function matchToRow"))
  assert.match(body, /grade: null/)
  assert.match(body, /move: ""/)
  assert.doesNotMatch(body, /deriveMove/)
})
