import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import type { ApplicationResponse, JobMatch } from "../lib/api"
import { buildFeed, sortItems, fitTier, SORTS, type FeedItem } from "../lib/dashboard/feed-model"

function match(partial: Partial<JobMatch>): JobMatch {
  return {
    id: 1,
    job_id: "job-1",
    title: "Analyst",
    company: "Acme",
    location: null,
    remote: false,
    overlap_score: 80,
    match_score: 80,
    verdict: "strong",
    is_strong: true,
    llm_rank: 1,
    llm_explanation: null,
    batch_week: "2026-06-01",
    source_url: null,
    matched_skills: [],
    job_description: null,
    ...partial,
  }
}

function application(partial: Partial<ApplicationResponse>): ApplicationResponse {
  return {
    id: 1,
    job_id: "job-1",
    title: "Analyst",
    company: "Acme",
    job_description: null,
    status: "saved",
    source: "user_discovery",
    applied_at: null,
    response_at: null,
    checkin_sent_at: null,
    followed_up_at: null,
    closed_at: null,
    offer_received_at: null,
    notes: null,
    created_at: "2026-06-01T08:00:00Z",
    last_stage_changed_at: null,
    is_first_offer: false,
    cv_badge: null,
    coins_earned: null,
    coin_balance: null,
    ...partial,
  }
}

test("dashboard feed hides dismissed match cards from all segments", () => {
  const feed = buildFeed(
    [match({ job_id: "keep-job" }), match({ job_id: "dismissed-job" })],
    [application({ job_id: "dismissed-job" })],
    new Set(["dismissed-job"]),
  )

  assert.deepEqual(feed.items.map((item) => item.jobId), ["keep-job"])
})

function feedItem(partial: Partial<FeedItem>): FeedItem {
  return {
    jobId: "j",
    company: "Acme",
    role: "Analyst",
    fit: 50,
    isMatch: true,
    isLiked: false,
    job: match({}),
    ...partial,
  }
}

test("sortItems: Best fit sorts by score desc, null (liked-only) sinks last", () => {
  const items = [
    feedItem({ jobId: "a", fit: 20 }),
    feedItem({ jobId: "b", fit: 90 }),
    feedItem({ jobId: "liked", fit: null }),
    feedItem({ jobId: "c", fit: 50 }),
  ]
  assert.deepEqual(sortItems(items, "fit").map((i) => i.jobId), ["b", "c", "a", "liked"])
})

test("sortItems: Company sorts A–Z, case-insensitive, nulls last", () => {
  const items = [
    feedItem({ jobId: "z", company: "Zeta" }),
    feedItem({ jobId: "n", company: null }),
    feedItem({ jobId: "a", company: "acme" }),
  ]
  assert.deepEqual(sortItems(items, "company").map((i) => i.jobId), ["a", "z", "n"])
})

test("sortItems: Most recent sorts by first_seen desc, undated last", () => {
  const items = [
    feedItem({ jobId: "old", job: match({ first_seen: "2026-06-01T00:00:00Z" }) }),
    feedItem({ jobId: "new", job: match({ first_seen: "2026-06-10T00:00:00Z" }) }),
    feedItem({ jobId: "undated", job: match({ first_seen: null }) }),
  ]
  assert.deepEqual(sortItems(items, "recent").map((i) => i.jobId), ["new", "old", "undated"])
})

test("fitTier: low fit never reads as strong", () => {
  assert.equal(fitTier(17), "low")
  assert.equal(fitTier(39), "low")
  assert.equal(fitTier(40), "mid")
  assert.equal(fitTier(64), "mid")
  assert.equal(fitTier(65), "strong")
  assert.equal(fitTier(92), "strong")
})

// ── one ordering ──────────────────────────────────────────────────────────────
//
// `scoreItem` / `winnabilityOf` / `triageFeed` are DELETED. They ranked by
// `prize × winnability` — a client-side fit score that could disagree with the
// Match Verdict printed on the very card it was ordering, and whose `prizeTags`
// ("⭐ Followed", "🎯 Target role") were computed and never rendered. Followed
// company and target role are targeting facts: they belong in the Targeting
// Brief, where the brain reads them into the verdict, not in a multiplier
// applied after the ranking is done.

test("SORTS offers no second opinion about fit", () => {
  const keys = SORTS.map((s) => s.key)
  assert.deepEqual(keys, ["fit", "recent", "company"])
  // "Best fit" is the Match Verdict. The others answer different questions
  // (when, who) — they are not competing claims about the same one.
  assert.equal(SORTS[0]?.label, "Best fit")
})

test("the deleted client-side ranker has not grown back", () => {
  const model = readFileSync(new URL("../lib/dashboard/feed-model.ts", import.meta.url), "utf8")
  const collections = readFileSync(new URL("../lib/collections/model.ts", import.meta.url), "utf8")
  for (const src of [model, collections]) {
    assert.doesNotMatch(src, /function winnabilityOf|export function scoreItem|export function triageFeed/)
    assert.doesNotMatch(src, /prize \* winnability/)
  }
})
