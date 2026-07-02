import test from "node:test"
import assert from "node:assert/strict"

import type { ApplicationResponse, JobMatch } from "../lib/api"
import { buildFeed, sortItems, fitTier, type FeedItem } from "../lib/dashboard/feed-model"

function match(partial: Partial<JobMatch>): JobMatch {
  return {
    id: 1,
    job_id: "job-1",
    title: "Analyst",
    company: "Acme",
    location: null,
    remote: false,
    overlap_score: 80,
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

// ── prize × winnability triage (the "which CV do I tailor next" queue) ──────────

import { scoreItem, triageFeed, type TriageContext } from "../lib/dashboard/feed-model"

function ctx(partial: Partial<TriageContext> = {}): TriageContext {
  return {
    followedCompanies: new Set<string>(),
    targetRoles: [],
    tailoredJobIds: new Set<string>(),
    committedJobIds: new Set<string>(),
    ...partial,
  }
}

test("scoreItem: followed company + target role lift prize; fit drives winnability", () => {
  const c = ctx({ followedCompanies: new Set(["accenture"]), targetRoles: ["Data Scientist"] })
  const prized = scoreItem(feedItem({ company: "Accenture", role: "Senior Data Scientist", fit: 80 }), c)
  const plain = scoreItem(feedItem({ company: "Nobody Inc", role: "Analyst", fit: 80 }), c)
  // same winnability, but the prize company + target role rank far higher
  assert.ok(prized.rank > plain.rank)
  assert.ok(prized.prizeTags.length >= 1)
  assert.equal(plain.prizeTags.length, 0)
})

test("scoreItem: prize × winnability — a winnable prize beats an unwinnable one", () => {
  const c = ctx({ followedCompanies: new Set(["accenture"]) })
  const winnable = scoreItem(feedItem({ company: "Accenture", fit: 85 }), c)
  const longshot = scoreItem(feedItem({ company: "Accenture", fit: 15 }), c)
  assert.ok(winnable.rank > longshot.rank)
})

test("triageFeed: tailored-not-applied pins to Continue; applied drops; rest is the ranked queue", () => {
  const items = [
    feedItem({ jobId: "applied", company: "Acme", fit: 90 }),
    feedItem({ jobId: "tailored", company: "Acme", fit: 30 }),
    feedItem({ jobId: "prize", company: "Accenture", fit: 70 }),
    feedItem({ jobId: "plain", company: "Nobody", fit: 70 }),
  ]
  const res = triageFeed(items, ctx({
    followedCompanies: new Set(["accenture"]),
    tailoredJobIds: new Set(["tailored"]),
    committedJobIds: new Set(["applied"]),
  }))
  // applied never appears in Continue or queue
  assert.equal(res.appliedCount, 1)
  assert.ok(!res.continueItems.some(i => i.jobId === "applied"))
  assert.ok(!res.queueItems.some(i => i.jobId === "applied"))
  // tailored-not-applied is the Continue pin
  assert.deepEqual(res.continueItems.map(i => i.jobId), ["tailored"])
  // queue is prize×winnability ranked — the followed-company prize outranks the plain job
  assert.deepEqual(res.queueItems.map(i => i.jobId), ["prize", "plain"])
})

test("triageFeed: a tailored job that was also applied drops (committed wins over continue)", () => {
  const items = [feedItem({ jobId: "done", company: "Acme", fit: 50 })]
  const res = triageFeed(items, ctx({
    tailoredJobIds: new Set(["done"]),
    committedJobIds: new Set(["done"]),
  }))
  assert.equal(res.continueItems.length, 0)
  assert.equal(res.queueItems.length, 0)
  assert.equal(res.appliedCount, 1)
})
