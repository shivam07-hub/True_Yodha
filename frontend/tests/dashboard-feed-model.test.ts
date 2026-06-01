import test from "node:test"
import assert from "node:assert/strict"

import type { ApplicationResponse, JobMatch } from "../lib/api"
import { buildFeed } from "../lib/dashboard/feed-model"

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
    xp_earned: null,
    xp_balance: null,
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
