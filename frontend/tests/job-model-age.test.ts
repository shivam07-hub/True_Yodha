import assert from "node:assert/strict"
import test from "node:test"

import type { JobFeedItem } from "../lib/api"
import { feedItemToRow } from "../mobile/redesign/job-model"

function item(over: Partial<JobFeedItem> = {}): JobFeedItem {
  return {
    job_id: "j",
    job_title: "Analyst",
    company_name: "Acme",
    job_description: null,
    is_active: true,
    skills: [],
    matched_skill_count: 0,
    target_role_match: 0,
    first_seen: "2026-07-11",
    last_seen_at: "2020-01-01",
    ...over,
  }
}

test("the phone row's age is discovery, and a day without a confirmation is not a verification", () => {
  const row = feedItemToRow(item())

  assert.equal(row.verified, "")
  assert.equal(row.ago, feedItemToRow(item({ last_seen_at: "2026-09-01" })).ago)
  assert.equal(feedItemToRow(item({ is_stale: true })).verified, "")
})

test("a confirmed listing says when it was checked", () => {
  const checked = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10)
  const row = feedItemToRow(item({ is_stale: false, last_seen_at: checked }))

  assert.match(row.verified, /^verified \d+d ago$/)
})

test("a listing checked today says today, not 'today ago'", () => {
  const today = new Date().toISOString().slice(0, 10)
  const row = feedItemToRow(item({ is_stale: false, last_seen_at: today }))

  assert.equal(row.verified, "verified today")
})
