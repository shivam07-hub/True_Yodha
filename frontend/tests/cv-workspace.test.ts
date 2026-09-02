import test from "node:test"
import assert from "node:assert/strict"

import type { ApplicationResponse, CVVersion } from "../lib/api"
import {
  buildCVWorkspaceStats,
  getJobWorkspaceAction,
  pickNewCvJobId,
} from "../lib/cv/workspace"

function cvVersion(partial: Partial<CVVersion>): CVVersion {
  return {
    id: 1,
    user_version_number: 1,
    kind: "baseline_upload",
    job_id: null,
    parent_version_id: null,
    baseline_version_id: null,
    title: null,
    hidden_items: [],
    edited_items: {},
    body_text: "MASTER CV TEXT",
    polished_text: null,
    ai_polished: false,
    created_at: "2026-05-31T08:00:00Z",
    job_title: null,
    company_name: null,
    footer_mark_hidden: false,
    ...partial,
  }
}

function application(partial: Partial<ApplicationResponse>): ApplicationResponse {
  return {
    id: 1,
    job_id: "job-1",
    title: "Growth Associate",
    company: "Myro",
    job_description: null,
    status: "saved",
    source: "system_match",
    applied_at: null,
    response_at: null,
    checkin_sent_at: null,
    followed_up_at: null,
    closed_at: null,
    offer_received_at: null,
    notes: null,
    created_at: "2026-05-31T08:00:00Z",
    last_stage_changed_at: null,
    is_first_offer: false,
    cv_badge: null,
    coins_earned: null,
    coin_balance: null,
    ...partial,
  }
}

test("CV workspace stats are non-interactive; COMPANIES counts tracked companies (matches the folder list)", () => {
  const stats = buildCVWorkspaceStats(
    [
      cvVersion({ id: 1 }),
      cvVersion({ id: 2, kind: "deterministic", job_id: "job-1", company_name: "3M" }),
      cvVersion({ id: 3, kind: "polished", job_id: "job-2", company_name: "3M" }),
    ],
    [
      application({ id: 1, job_id: "job-1", status: "saved", company: "3M" }),
      application({ id: 2, job_id: "job-2", status: "applied", company: "3M" }),
      application({ id: 3, job_id: "job-3", status: "interviewing", company: "Acme" }),
    ],
  )

  assert.deepEqual(stats.map((stat) => stat.key), ["tailored", "companies", "pipeline"])
  assert.deepEqual(stats.map((stat) => stat.interactive), [false, false, false])
  assert.equal(stats[0].value, 2)
  // Tracked companies = unique companies across saved/applied/screening/... apps → 3M + Acme = 2.
  assert.equal(stats[1].value, 2)
  assert.equal(stats[1].sub, "tracked")
  // Pipeline = applied + screening (saved excluded) = 2.
  assert.equal(stats[2].value, 2)
})

test("CV workspace job action labels match the real destination", () => {
  assert.equal(getJobWorkspaceAction(null).label, "Create tailored CV")
  assert.equal(getJobWorkspaceAction(cvVersion({ kind: "deterministic", job_id: "job-1" })).label, "Open latest CV")
})

test("new CV action prefers a company role without a tailored CV", () => {
  const apps = [
    application({ id: 1, job_id: "job-with-cv" }),
    application({ id: 2, job_id: "job-without-cv" }),
  ]
  const versions = [
    cvVersion({ id: 10, kind: "deterministic", job_id: "job-with-cv", company_name: "3M" }),
  ]

  assert.equal(pickNewCvJobId(apps, versions), "job-without-cv")
})

test("new CV action prepares the best-fit untailored save", () => {
  // This used to assert the HEART led. That was a rank the user had to maintain
  // by hand and never once did, so the tie fell to insertion order in practice.
  const apps = [
    application({ id: 1, job_id: "ordinary", match_score: 41 }),
    application({ id: 2, job_id: "best-fit", match_score: 88 }),
  ]

  assert.equal(pickNewCvJobId(apps, []), "best-fit")
})
