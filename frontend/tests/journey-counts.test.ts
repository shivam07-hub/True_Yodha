import test from "node:test"
import assert from "node:assert/strict"

import { deriveJourneyCounts } from "../components/nav/journey-counts"
import type { ApplicationResponse } from "../lib/api"

/** Journey counts on the nav tabs (unified-structure S1) — the nav IS the
 *  pipeline read, so the numbers must be exact and applied-aware. */

const badge: ApplicationResponse["cv_badge"] = { version_id: 1, version_number: 1, kind: "deterministic", polished: false }

const app = (over: Partial<ApplicationResponse>): ApplicationResponse =>
  ({ job_id: "j", status: "saved", cv_badge: null, source: "system_match", ...over }) as ApplicationResponse

test("collected = saved-only; applied rows leave the Collections count", () => {
  const counts = deriveJourneyCounts([
    app({ job_id: "a" }),
    app({ job_id: "b" }),
    app({ job_id: "c", status: "applied" }),
  ])
  assert.equal(counts.collected, 2)
})

test("tailored counts cv_badge among in-play rows only", () => {
  const counts = deriveJourneyCounts([
    app({ job_id: "a", cv_badge: badge }),
    app({ job_id: "b" }),
    app({ job_id: "c", status: "applied", cv_badge: badge }), // applied → not in Tailor lane
  ])
  assert.equal(counts.tailored, 1)
})

test("liveRooms = applied + interviewing (terminal stages excluded)", () => {
  const counts = deriveJourneyCounts([
    app({ job_id: "a", status: "applied" }),
    app({ job_id: "b", status: "interviewing" }),
    app({ job_id: "c", status: "rejected" }),
    app({ job_id: "d" }),
  ])
  assert.equal(counts.liveRooms, 2)
})

test("empty pipeline is all zeros — tabs render count-less", () => {
  assert.deepEqual(deriveJourneyCounts([]), { collected: 0, tailored: 0, liveRooms: 0 })
})
