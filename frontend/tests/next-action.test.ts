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
  const next = deriveNextAction(
    [app({ status: "interviewing" })],
    undefined,
    { cvPresence: "absent", now: NOW },
  )
  assert.equal(next.href, "/cv")
})

test("unresolved CV truth never manufactures an upload action", () => {
  const next = deriveNextAction(
    [app({ status: "interviewing" })],
    undefined,
    { cvPresence: "unknown", now: NOW },
  )
  assert.equal(next, null)
})

test("the upload pointer is generic so the chip hides on /cv itself", () => {
  // has_cv stays false for the whole analysis, so without this the chip tells a
  // user watching their own CV parse to go upload a CV.
  const next = deriveNextAction([], undefined, { cvPresence: "absent", now: NOW })
  assert.equal(next.generic, true)
})

test("interviewing room outranks everything with a CV", () => {
  const next = deriveNextAction(
    [app({ job_id: "a", cv_badge: badge }), app({ job_id: "b", status: "interviewing", company: "Sanofi" })],
    undefined,
    { cvPresence: "present", now: NOW },
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
    { cvPresence: "present", now: NOW },
  )
  assert.equal(next.href, "/preparations/b")
  assert.match(next.label, /Check on 3M/)
})

test("tailored-but-unsent outranks tailoring another", () => {
  const next = deriveNextAction(
    [app({ job_id: "a", cv_badge: badge, company: "Ready Co" }), app({ job_id: "b" })],
    undefined,
    { cvPresence: "present", now: NOW },
  )
  assert.match(next.label, /Apply to Ready Co/)
  assert.equal(next.href, "/collections?jobId=a")
})

test("tailor targets the best-fit untailored save, fit from cached matches", () => {
  const next = deriveNextAction(
    [app({ job_id: "lo", company: "Low" }), app({ job_id: "hi", company: "High" })],
    [match("lo", 48), match("hi", 91)],
    { cvPresence: "present", now: NOW },
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
    { cvPresence: "present", now: NOW },
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
    { cvPresence: "present", now: NOW },
  )

  assert.equal(next.href, "/cv?jobId=priority")
  assert.match(next.label, /Tailor Priority · 48%/)
})

test("the open job is dropped — the chip names what comes AFTER it, not the screen itself", () => {
  // On /cv?jobId=capgemini the playground already carries this job's own primary
  // CTA. Echoing it in the chip pointed at the page the user was standing on.
  // The open job outranks the other on fit, so it is what the ladder WOULD name.
  const next = deriveNextAction(
    [
      scoredApp({ job_id: "capgemini", company: "Capgemini", match_score: 55 }),
      scoredApp({ job_id: "infosys", company: "Infosys", match_score: 40 }),
    ],
    undefined,
    { cvPresence: "present", now: NOW, openJobId: "capgemini" },
  )
  assert.equal(next.href, "/cv?jobId=infosys")
  assert.match(next.label, /Tailor Infosys · 40%/)
})

test("the open job is dropped from every rung, not just the tailor one", () => {
  // The apply rung's href is /collections?jobId= — sending a user away from the
  // playground whose Apply button is the very action being named.
  const next = deriveNextAction(
    [app({ job_id: "open", company: "Open Co", cv_badge: badge }), app({ job_id: "other", company: "Other Co" })],
    undefined,
    { cvPresence: "present", now: NOW, openJobId: "open" },
  )
  assert.equal(next.href, "/cv?jobId=other")
  assert.match(next.label, /Tailor Other Co/)
})

test("a prep room's own job is dropped so the room is never told to prep itself", () => {
  const next = deriveNextAction(
    [app({ job_id: "here", status: "interviewing", company: "Here Co" })],
    undefined,
    { cvPresence: "present", now: NOW, openJobId: "here" },
  )
  assert.equal(next.href, "/market")
  assert.equal(next.generic, true)
})

test("an open job that is the only saved role falls through to the generic pointer", () => {
  const next = deriveNextAction(
    [scoredApp({ job_id: "solo", company: "Solo Co", match_score: 33 })],
    undefined,
    { cvPresence: "present", now: NOW, openJobId: "solo" },
  )
  assert.equal(next.label, "Find a role to tailor")
  assert.equal(next.generic, true)
})

test("no openJobId leaves the ladder untouched", () => {
  const next = deriveNextAction(
    [scoredApp({ job_id: "capgemini", company: "Capgemini", match_score: 33 })],
    undefined,
    { cvPresence: "present", now: NOW },
  )
  assert.equal(next.href, "/cv?jobId=capgemini")
})

test("empty pipeline with fresh matches points at the new-jobs run", () => {
  const next = deriveNextAction([], undefined, { cvPresence: "present", newJobs: 12, now: NOW })
  assert.equal(next.href, "/collections?search=1")
  assert.match(next.label, /12 new/)
})

test("nothing saved → find a role to tailor, marked generic", () => {
  const next = deriveNextAction([], undefined, { cvPresence: "present", now: NOW })
  assert.equal(next.href, "/market")
  assert.equal(next.label, "Find a role to tailor")
  assert.equal(next.generic, true)
})

/* The loop's exit — grill 2026-08-05, lock #7.
 *
 * Both endings of a job surface land on the last rung: "I applied to this" and
 * "this listing is dead" each leave nothing better on the ladder. Both ask the
 * same question — what else looks like this one — and the chip is the single
 * answer. The inline "Find similar roles" that used to answer it was wired to
 * nothing on the CV surfaces.
 */

test("finishing with a job points at more of its kind, not the whole board", () => {
  const next = deriveNextAction(
    [scoredApp({ job_id: "siemens", company: "Siemens", match_score: 33 })],
    undefined,
    {
      cvPresence: "present",
      now: NOW,
      openJobId: "siemens",
      openJobDomain: "Data & Analytics",
    },
  )
  // `cluster` is /market's long-standing name for the role_domain filter.
  assert.equal(next.href, "/market?cluster=Data%20%26%20Analytics")
  assert.equal(next.label, "More Data & Analytics roles")
  assert.equal(next.generic, true)
})

test("an unknown domain still gives a working destination", () => {
  const next = deriveNextAction([], undefined, {
    cvPresence: "present",
    now: NOW,
    openJobDomain: "   ",
  })
  assert.equal(next.href, "/market")
  assert.equal(next.label, "Find a role to tailor")
})

test("the scoped rung never pre-empts a real next step", () => {
  // A saved, untailored role outranks browsing — the domain scope is the last
  // rung only, never a shortcut past unfinished work.
  const next = deriveNextAction(
    [
      scoredApp({ job_id: "siemens", company: "Siemens", match_score: 33 }),
      scoredApp({ job_id: "infosys", company: "Infosys", match_score: 71 }),
    ],
    undefined,
    {
      cvPresence: "present",
      now: NOW,
      openJobId: "siemens",
      openJobDomain: "Data & Analytics",
    },
  )
  assert.equal(next.href, "/cv?jobId=infosys")
})
