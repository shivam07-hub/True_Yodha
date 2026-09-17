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


test("the drawer explains; it does not re-judge", () => {
  const take = read("../components/jobs/myro-take.tsx")
  const brain = read("../components/jobs/match-brain.tsx")

  // The ring on the card is the one answer to "how good" (CONTEXT.md Match
  // Verdict). The drawer used to restate it four more ways.
  assert.doesNotMatch(take, /GradeBadge|VerdictPill|AxisBreakdown/)
  assert.doesNotMatch(take, /overall_score\.toFixed/)
  // ...and nothing else rendered them, so they went with it.
  assert.doesNotMatch(brain, /export function (GradeBadge|VerdictPill|AxisBreakdown|JobMatchDetail)/)

  // What the ring cannot say stays: what the role is, whether it is real, why,
  // and how to apply.
  assert.match(take, /ArchetypeChip/)
  assert.match(take, /LegitimacyBadge/)
  assert.match(take, /application_angle/)
  // The reader's own line wins over the evaluator's internal summary.
  assert.match(take, /r\.pick_reason \|\| r\.summary/)
})
