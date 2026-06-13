import test from "node:test"
import assert from "node:assert/strict"

import type { GrowthBootstrapResponse } from "../lib/api"
import { parseGrowthSnapshot } from "../components/growth/growth-snapshot"

const data: GrowthBootstrapResponse = {
  operator: {
    user_id: "operator-1",
    role: "owner",
    active: true,
    display_name: "Shivam",
  },
  assets: [
    {
      id: "asset-1",
      legacy_key: "tracker:issue:cv-proof",
      kind: "newsletter",
      title: "CV proof",
      slug: "cv-proof",
      summary: "Proof-led bullets",
      canonical_url: "https://www.himyro.com/newsletter/cv-proof",
      audience: null,
      primary_action: null,
      status: "published",
      sensitivity: "low",
      evidence_fresh_until: null,
      metadata: {},
      owner_id: null,
      created_at: null,
      updated_at: null,
    },
  ],
  campaigns: [],
  messages: [
    {
      id: "message-1",
      legacy_key: "tracker:posting:p1",
      campaign_id: null,
      asset_id: "asset-1",
      channel: "linkedin",
      format: "post",
      variant: "p1",
      audience: null,
      intent: "distribution",
      subject: null,
      draft_copy: "Prepared draft",
      final_copy: null,
      call_to_action_url: null,
      utm_url: null,
      composer_url: "https://www.linkedin.com/feed/?shareActive=true",
      status: "draft",
      automation_level: "manual",
      sensitivity: "low",
      reviewer_id: null,
      approved_at: null,
      planned_at: "2026-06-10T09:00:00Z",
      failure_reason: null,
      metadata: { tracker_id: "p1", prepared_draft: "Prepared draft" },
      created_at: null,
      updated_at: null,
    },
  ],
  publications: [],
  sweeps: [],
  summary: { assets: 1, campaigns: 0, needs_review: 0, published: 0 },
}

test("original localStorage override snapshot restores edits and publication evidence", () => {
  const payload = parseGrowthSnapshot(
    JSON.stringify({
      p1: {
        draftEdit: "Shivam working edit",
        posted: "Exact copy that went live",
        status: "posted",
        liveUrl: "https://www.linkedin.com/feed/update/urn:li:activity:1",
        impressions: 420,
        clicks: 17,
      },
    }),
    data,
  )

  assert.equal(payload.messages[0].draft_copy, "Shivam working edit")
  assert.equal(payload.messages[0].final_copy, "Exact copy that went live")
  assert.equal(payload.messages[0].status, "published")
  assert.equal(
    payload.publications[0].final_copy_snapshot,
    "Exact copy that went live",
  )
  assert.deepEqual(payload.publications[0].outcome, {
    impressions: 420,
    clicks: 17,
  })
})
