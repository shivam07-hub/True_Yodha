import assert from "node:assert/strict"
import test from "node:test"
import type { CompanySkillIntelligence } from "../lib/api"
import { skillDemandView } from "../lib/company-skill-demand"

function snapshot(skills: CompanySkillIntelligence["skills"]): CompanySkillIntelligence {
  return {
    company_id: 140,
    company_name: "American Express",
    slug: "americanexpress",
    as_of: "2026-07-11T06:43:25.440140Z",
    source_run_id: "b19da925-7444-4f14-8463-a1d4555da42b",
    skills,
    newsletter_summary: {
      top_skills: [],
      emerging_skills: [],
      declining_skills: [],
      dormant_skills: [],
    },
  }
}

const python = {
  skill_id: 1,
  display_name: "Python",
  taxonomy_key: "python",
  domain: "Technology",
  current_job_count: 12,
  peak_job_count: 18,
  observation_run_count: 4,
  avg_required_level: 3.2,
  trend_signal: "emerging" as const,
  first_seen_at: "2026-06-01T00:00:00+00:00",
  last_seen_at: "2026-07-11T10:00:00+00:00",
}

test("a first open shows loading until the snapshot returns", () => {
  assert.equal(skillDemandView({ fetching: true, error: false, data: undefined }).kind, "loading")
})

test("a thrown read is an error the user can retry", () => {
  assert.equal(skillDemandView({ fetching: false, error: true, data: undefined }).kind, "error")
})

test("retry in flight replaces the error with loading when there is no snapshot yet", () => {
  assert.equal(skillDemandView({ fetching: true, error: true, data: undefined }).kind, "loading")
})

test("an empty snapshot is empty, not a loaded card and not an error", () => {
  assert.equal(
    skillDemandView({ fetching: false, error: false, data: snapshot([]) }).kind,
    "empty",
  )
  assert.equal(skillDemandView({ fetching: false, error: false, data: null }).kind, "empty")
})

test("a snapshot with skills is ready", () => {
  const view = skillDemandView({ fetching: false, error: false, data: snapshot([python]) })
  assert.equal(view.kind, "ready")
  if (view.kind === "ready") assert.equal(view.data.skills[0]?.display_name, "Python")
})

test("a later failed refetch keeps the last loaded snapshot", () => {
  const view = skillDemandView({
    fetching: false,
    error: true,
    data: snapshot([python]),
  })
  assert.equal(view.kind, "ready")
})
