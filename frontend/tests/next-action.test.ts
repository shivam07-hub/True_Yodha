import test from "node:test"
import assert from "node:assert/strict"

import { deriveNextAction } from "../components/nav/next-action"
import type { ApplicationResponse, JobMatch } from "../lib/api"

/** Global Next chip ladder (unified-structure S2) — finish-first: the action
 *  closest to an outcome wins. */

const badge: ApplicationResponse["cv_badge"] = { version_id: 1, version_number: 1, kind: "deterministic", polished: false }
const NOW = new Date("2026-07-16T12:00:00Z")

const app = (over: Partial<ApplicationResponse>): ApplicationResponse =>
  ({
    job_id: "j",
    title: "Role",
    company: "Acme",
    status: "saved",
    cv_badge: null,
    source: "system_match",
    created_at: "2026-07-15T00:00:00Z",
    ...over,
  }) as ApplicationResponse

const scoredApp = (over: Partial<ApplicationResponse> & { match_score?: number | null }): ApplicationResponse =>
  app(over)

const match = (job_id: string, match_score: number): JobMatch => ({ job_id, match_score }) as JobMatch

test("no CV beats everything", () => {
  const next = deriveNextAction([app({ status: "interviewing" })], undefined, { hasCv: false, now: NOW })
  assert.equal(next.href, "/cv")
})

test("interviewing room outranks everything with a CV", () => {
  const next = deriveNextAction(
    [app({ job_id: "a", cv_badge: badge }), app({ job_id: "b", status: "interviewing", company: "Sanofi" })],
    undefined,
    { hasCv: true, now: NOW },
  )
  assert.equal(next.href, "/preparations/b")
  assert.match(next.label, /Sanofi/)
})

test("overdue applied room outranks apply-ready", () => {
  const next = deriveNextAction(
    [
      app({ job_id: "a", cv_badge: badge }),
      app({ job_id: "b", status: "applied", company: "3M", applied_at: "2026-07-01T00:00:00Z" }),
    ],
    undefined,
    { hasCv: true, now: NOW },
  )
  assert.equal(next.href, "/preparations/b")
  assert.match(next.label, /Check on 3M/)
})

test("tailored-but-unsent outranks tailoring another", () => {
  const next = deriveNextAction(
    [app({ job_id: "a", cv_badge: badge, company: "Ready Co" }), app({ job_id: "b" })],
    undefined,
    { hasCv: true, now: NOW },
  )
  assert.match(next.label, /Apply to Ready Co/)
  assert.equal(next.href, "/collections?jobId=a")
})

test("tailor targets the best-fit untailored save, fit from cached matches", () => {
  const next = deriveNextAction(
    [app({ job_id: "lo", company: "Low" }), app({ job_id: "hi", company: "High" })],
    [match("lo", 48), match("hi", 91)],
    { hasCv: true, now: NOW },
  )
  assert.equal(next.href, "/cv?jobId=hi")
  assert.match(next.label, /Tailor High · 91%/)
})

test("tailor selects the highest durable saved-match score before a matches cache exists", () => {
  const next = deriveNextAction(
    [
      scoredApp({ job_id: "lo", company: "Low", match_score: 48 }),
      scoredApp({ job_id: "hi", company: "High", match_score: 91 }),
    ],
    undefined,
    { hasCv: true, now: NOW },
  )
  assert.equal(next.href, "/cv?jobId=hi")
  assert.match(next.label, /Tailor High · 91%/)
})

test("a priority save leads the next preparation action over a higher-fit ordinary save", () => {
  const next = deriveNextAction(
    [
      scoredApp({ job_id: "ordinary", company: "Ordinary", match_score: 91 }),
      scoredApp({ job_id: "priority", company: "Priority", match_score: 48, is_priority: true }),
    ],
    undefined,
    { hasCv: true, now: NOW },
  )

  assert.equal(next.href, "/cv?jobId=priority")
  assert.match(next.label, /Tailor Priority · 48%/)
})

test("empty pipeline with fresh matches points at the new-jobs run", () => {
  const next = deriveNextAction([], undefined, { hasCv: true, newJobs: 12, now: NOW })
  assert.equal(next.href, "/collections?search=1")
  assert.match(next.label, /12 new/)
})

test("nothing saved → find a role to tailor, marked generic", () => {
  const next = deriveNextAction([], undefined, { hasCv: true, now: NOW })
  assert.equal(next.href, "/market")
  assert.equal(next.label, "Find a role to tailor")
  assert.equal(next.generic, true)
})
