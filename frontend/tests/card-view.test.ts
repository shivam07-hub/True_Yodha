import test from "node:test"
import assert from "node:assert/strict"

import type { JobFeedItem, JobMatch } from "../lib/api"
import { feedDataFromFeedItem, feedDataFromMatch } from "../lib/jobs/card-view"

function feedItem(partial: Partial<JobFeedItem>): JobFeedItem {
  return {
    job_id: "job-1",
    job_title: "Data Analyst",
    company_name: "Acme",
    job_description: "desc",
    is_active: true,
    skills: [],
    matched_skill_count: 0,
    target_role_match: 0,
    ...partial,
  }
}

function match(partial: Partial<JobMatch>): JobMatch {
  return {
    id: 1,
    job_id: "job-1",
    title: "Data Analyst",
    company: "Acme",
    location: null,
    remote: false,
    overlap_score: 40,
    match_score: 40,
    verdict: "worth_it",
    is_strong: false,
    llm_rank: 1,
    llm_explanation: null,
    batch_week: "2026-06-01",
    source_url: null,
    matched_skills: [],
    job_description: null,
    ...partial,
  }
}

// ── Market feed adapter (T3-1) ────────────────────────────────────────────────

test("market: with a CV, job skills split into ✓matched and ✗missing chips", () => {
  const data = feedDataFromFeedItem(
    feedItem({ skills: ["Python", "SQL", "Spark"], matched_skills: ["Python"], matched_skill_count: 1 }),
    { hasCv: true },
  )
  const matched = data.chips.filter((c) => c.matched).map((c) => c.name)
  const missing = data.chips.filter((c) => c.missing).map((c) => c.name)
  assert.deepEqual(matched, ["Python"])
  assert.deepEqual(missing, ["SQL", "Spark"])
  // A chip is never both states.
  assert.ok(data.chips.every((c) => !(c.matched && c.missing)))
})

test("market: no CV → plain chips, nothing flagged as a gap", () => {
  const data = feedDataFromFeedItem(
    feedItem({ skills: ["Python", "SQL"], matched_skill_count: 0 }),
    { hasCv: false },
  )
  assert.ok(data.chips.every((c) => !c.matched && !c.missing))
})

test("skillCount: unified 'N/M skills' coverage set with a CV, undefined without", () => {
  const withCv = feedDataFromFeedItem(
    feedItem({ skills: ["Python", "SQL", "Spark"], matched_skills: ["Python"], matched_skill_count: 1 }),
    { hasCv: true },
  )
  assert.deepEqual(withCv.skillCount, { matched: 1, total: 3 }) // "1/3 skills"

  const noCv = feedDataFromFeedItem(feedItem({ skills: ["Python", "SQL"] }), { hasCv: false })
  assert.equal(noCv.skillCount, undefined) // no have/haven't split → no count

  const noSkills = feedDataFromFeedItem(feedItem({ skills: [], matched_skills: [] }), { hasCv: true })
  assert.equal(noSkills.skillCount, undefined) // nothing required → nothing to count
})

test("market: 0 overlap → no dead-end fit pill (chips carry the gap reason)", () => {
  const data = feedDataFromFeedItem(
    feedItem({ skills: ["Go", "Rust"], matched_skills: [], matched_skill_count: 0 }),
    { hasCv: true },
  )
  assert.equal(data.fit, null) // the ✗ chips below ARE the explanation, not a pill
  assert.ok(data.chips.some((c) => c.missing))
})

// ── The "best jobs" rule — brain-ranked market cards ─────────────────────────

test("market: a warmed card shows the score ring + verdict (the judge)", () => {
  const data = feedDataFromFeedItem(
    feedItem({ skills: ["Python"], matched_skills: ["Python"], matched_skill_count: 1,
               match_score: 84, verdict: "strong", is_strong: true }),
    { hasCv: true },
  )
  assert.deepEqual(data.fit, { kind: "score", value: 84, verdict: "strong" })
})

test("market: a warmed card has no move line — Save is the hero, chips are the gap", () => {
  const stretch = feedDataFromFeedItem(
    feedItem({ skills: ["Python", "SQL", "Spark"], matched_skills: ["Python"],
               matched_skill_count: 1, verdict: "stretch", match_score: 55 }),
    { hasCv: true },
  )
  assert.ok(!("move" in stretch))
  assert.deepEqual(stretch.fit, { kind: "score", value: 55, verdict: "stretch" })
})

test("market: an un-warmed card has no verdict move and falls back to overlap", () => {
  const data = feedDataFromFeedItem(
    feedItem({ skills: ["Python", "SQL"], matched_skills: ["Python"], matched_skill_count: 1 }),
    { hasCv: true },
  )
  assert.ok(!("move" in data))
  assert.deepEqual(data.fit, { kind: "overlap", count: 1 })
})

// ── Dashboard match adapter (T3-1) ────────────────────────────────────────────

test("dashboard: missing_skills render as ✗ chips after matched ✓ chips", () => {
  const data = feedDataFromMatch({
    jobId: "job-1",
    company: "Acme",
    role: "Data Analyst",
    fit: 40,
    job: match({ matched_skills: ["Python"], missing_skills: ["SQL", "Spark"] }),
  })
  assert.deepEqual(data.chips.filter((c) => c.matched).map((c) => c.name), ["Python"])
  assert.deepEqual(data.chips.filter((c) => c.missing).map((c) => c.name), ["SQL", "Spark"])
})

test("dashboard: absent missing_skills is tolerated (no gap chips)", () => {
  const data = feedDataFromMatch({
    jobId: "job-1",
    company: "Acme",
    role: "Data Analyst",
    fit: 80,
    job: match({ matched_skills: ["Python", "SQL"] }), // no missing_skills field
  })
  assert.ok(data.chips.every((c) => !c.missing))
  assert.equal(data.chips.filter((c) => c.matched).length, 2)
})
