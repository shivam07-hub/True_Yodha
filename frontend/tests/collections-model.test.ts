import test from "node:test"
import assert from "node:assert/strict"

import type { ApplicationResponse, JobMatch, JobPulse } from "../lib/api"
import {
  buildClosedView,
  buildMyroFound,
  chipCounts,
  isPulseClosed,
  splitClosedApps,
} from "../lib/collections/model"

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
    grade: "A",
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

function pulse(partial: Partial<JobPulse>): JobPulse {
  return {
    job_id: "job-1",
    first_seen_at: null,
    last_verified_at: null,
    is_stale: false,
    listing_confidence: "active",
    tracking_count: null,
    outcomes_shared: null,
    ghosted_count: null,
    response_signal: null,
    quality_report_count: null,
    ...partial,
  }
}

test("isPulseClosed reads the verifier's closed + likely_closed calls only", () => {
  assert.equal(isPulseClosed(pulse({ listing_confidence: "closed" })), true)
  assert.equal(isPulseClosed(pulse({ listing_confidence: "likely_closed" })), true)
  assert.equal(isPulseClosed(pulse({ listing_confidence: "active" })), false)
  assert.equal(isPulseClosed(pulse({ listing_confidence: "uncertain" })), false)
  assert.equal(isPulseClosed(undefined), false)
})

test("splitClosedApps routes a dead-listing saved job to closed, live ones stay open", () => {
  const apps = [
    application({ job_id: "alive" }),
    application({ job_id: "dead", status: "applied" }),
  ]
  const pulses = new Map([
    ["alive", pulse({ job_id: "alive", listing_confidence: "active" })],
    ["dead", pulse({ job_id: "dead", listing_confidence: "closed" })],
  ])
  const { open, closed } = splitClosedApps(apps, pulses)
  assert.deepEqual(open.map((a) => a.job_id), ["alive"])
  assert.deepEqual(closed.map((a) => a.job_id), ["dead"])
})

test("splitClosedApps treats a missing pulse as open (never guilty until verified)", () => {
  const apps = [application({ job_id: "unverified" })]
  const { open, closed } = splitClosedApps(apps, new Map())
  assert.deepEqual(open.map((a) => a.job_id), ["unverified"])
  assert.equal(closed.length, 0)
})

test("buildMyroFound pulls a closed match out before grading — dead beats a good grade", () => {
  const matches = [
    match({ job_id: "good-alive", grade: "A" }),
    match({ job_id: "good-dead", grade: "A" }),
  ]
  const pulses = new Map([["good-dead", pulse({ job_id: "good-dead", listing_confidence: "closed" })]])
  const view = buildMyroFound(matches, new Set(), new Set(), pulses)
  assert.deepEqual(view.found.map((it) => it.jobId), ["good-alive"])
  assert.deepEqual(view.closedMatches.map((m) => m.job_id), ["good-dead"])
})

test("buildClosedView never double-counts a job that's both saved and a found match", () => {
  const closedApps = [application({ job_id: "dead", status: "applied" })]
  const closedMatches = [match({ job_id: "dead" }), match({ job_id: "found-only-dead" })]
  const view = buildClosedView(closedApps, closedMatches, new Map())
  assert.deepEqual(view.map((it) => it.jobId).sort(), ["dead", "found-only-dead"])
})

test("chipCounts carries the closed count as its own bucket, defaulting to 0", () => {
  const apps = [application({ job_id: "a", status: "saved" })]
  assert.equal(chipCounts(apps, 3, 2).closed, 2)
  assert.equal(chipCounts(apps, 3).closed, 0)
})
