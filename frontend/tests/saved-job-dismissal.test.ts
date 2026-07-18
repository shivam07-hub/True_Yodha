import test from "node:test"
import assert from "node:assert/strict"

import type { ApplicationResponse, ApplicationStatus } from "../lib/api"
import {
  canDismissSavedApplication,
  removeSavedApplication,
  restoreSavedApplication,
} from "../lib/collections/saved-job-dismissal"

function application(jobId: string, status: ApplicationStatus = "saved"): ApplicationResponse {
  return {
    id: 1,
    job_id: jobId,
    title: "Analyst",
    company: "Acme",
    job_description: null,
    status,
    source: "user_discovery",
    applied_at: null,
    response_at: null,
    checkin_sent_at: null,
    notes: null,
    created_at: "2026-07-18T08:00:00Z",
  }
}

test("only an unsubmitted saved intent can be removed", () => {
  assert.equal(canDismissSavedApplication(application("saved", "saved")), true)
  for (const status of ["applied", "interviewing", "ghosted", "rejected", "offer"] as const) {
    assert.equal(canDismissSavedApplication(application(status, status)), false)
  }
})

test("optimistic removal updates the collection immediately and retains its position", () => {
  const before = [application("first"), application("remove"), application("last")]

  const transition = removeSavedApplication(before, "remove")

  assert.ok(transition)
  assert.deepEqual(transition.applications.map((item) => item.job_id), ["first", "last"])
  assert.equal(transition.snapshot.index, 1)
})

test("rollback or Undo restores the exact cached application without duplicates", () => {
  const before = [application("first"), application("remove"), application("last")]
  const transition = removeSavedApplication(before, "remove")
  assert.ok(transition)

  const restored = restoreSavedApplication(transition.applications, transition.snapshot)
  assert.deepEqual(restored, before)
  assert.deepEqual(restoreSavedApplication(restored, transition.snapshot), before)
})
