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

test("the phone row's age is discovery, and a crawl marker is not a verification", () => {
  const row = feedItemToRow(item())

  assert.equal(row.verified, "")
  assert.equal(row.ago, feedItemToRow(item({ last_seen_at: "2026-09-01" })).ago)
})

test("a confirmed listing says when it was checked", () => {
  const checked = new Date(Date.now() - 2 * 86_400_000).toISOString()
  const row = feedItemToRow(item({ is_stale: false, last_verified_live_at: checked }))

  assert.match(row.verified, /^verified \d+d ago$/)
})
