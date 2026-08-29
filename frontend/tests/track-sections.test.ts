/**
 * Where the feed marks a search boundary, and where it does not.
 *
 * The one rule with a user behind it: a single-track user — 83% of them, and
 * everyone before tracks existed — must get NOTHING. Every other case here is
 * about not drawing a line that says something untrue.
 */
import { strict as assert } from "node:assert"
import { test } from "node:test"

import { trackDividers } from "../lib/jobs/track-sections"
import type { JobFeedItem, Track } from "../lib/api"

type Verdict = JobFeedItem["verdict"]

function job(id: string, track: number | null, verdict: Verdict): JobFeedItem {
  return {
    job_id: id,
    job_title: id,
    company_name: null,
    job_description: null,
    track_id: track,
    verdict,
  } as JobFeedItem
}

const read = (id: string, track: number | null = null) => job(id, track, "worth_it")
const unread = (id: string, track: number | null = null) => job(id, track, "checking")

function track(id: number | null, label: string): Track {
  return { id, label, role_titles: [], position: id === null ? 1 : 2, is_profile: id === null }
}

const PROFILE = track(null, "Consulting")
const SECOND = track(9, "Marketing")

test("one search draws nothing at all", () => {
  // The invariant the whole feature is built around: a single-track user's
  // screen is byte-identical to the one before tracks existed.
  const ranked = [read("a"), read("b"), unread("c")]
  assert.deepEqual(trackDividers(ranked, [PROFILE]), [])
})

test("two searches are each named, in the order the feed gave them", () => {
  const ranked = [read("p1", null), read("p2", null), read("m1", 9)]
  const out = trackDividers(ranked, [PROFILE, SECOND])
  assert.deepEqual(out, [
    { beforeJobId: "p1", label: "Consulting", kind: "track" },
    { beforeJobId: "m1", label: "Marketing", kind: "track" },
  ])
})

test("the tier line goes where the brain stopped reading, per search", () => {
  const ranked = [
    read("p1", null), read("p2", null), unread("p3", null), unread("p4", null),
    read("m1", 9), unread("m2", 9),
  ]
  const out = trackDividers(ranked, [PROFILE, SECOND])
  assert.deepEqual(out.map((d) => [d.beforeJobId, d.kind]), [
    ["p1", "track"], ["p3", "tier"], ["m1", "track"], ["m2", "tier"],
  ])
})

test("a search with nothing read gets no tier line", () => {
  // "Marketing" immediately followed by "Not read yet" is two labels with no
  // content between them, and it reads as though the search failed. It did not
  // — those are real jobs, just unread.
  const ranked = [read("p1", null), unread("m1", 9), unread("m2", 9)]
  const out = trackDividers(ranked, [PROFILE, SECOND])
  assert.deepEqual(out.map((d) => d.kind), ["track", "track"])
})

test("a search with everything read gets no tier line either", () => {
  const ranked = [read("p1", null), read("m1", 9), read("m2", 9)]
  const out = trackDividers(ranked, [PROFILE, SECOND])
  assert.deepEqual(out.map((d) => d.kind), ["track", "track"])
})

test("one tier line per search, not one per unread row", () => {
  const ranked = [read("p1", null), unread("p2", null), unread("p3", null), unread("p4", null)]
  const out = trackDividers(ranked, [PROFILE, SECOND])
  assert.equal(out.filter((d) => d.kind === "tier").length, 1)
})

test("a row whose search was archived keeps its place, unannounced", () => {
  // The run stamped `track_id` when the search existed. Dropping the row would
  // hide a real job the user was matched to; announcing it would name a search
  // that is gone.
  const ranked = [read("p1", null), read("ghost", 404)]
  const out = trackDividers(ranked, [PROFILE, SECOND])
  assert.deepEqual(out.map((d) => d.label), ["Consulting"])
})

test("no ranked head means no dividers", () => {
  assert.deepEqual(trackDividers([], [PROFILE, SECOND]), [])
})

test("an undefined track_id is track 1, not a fourth search", () => {
  // The browse tail and any pre-tracks row carry no `track_id` at all. `null`
  // and `undefined` are the same search — the profile — and must not open two.
  const ranked = [job("a", null, "worth_it"), { ...job("b", null, "worth_it"), track_id: undefined }]
  const out = trackDividers(ranked as JobFeedItem[], [PROFILE, SECOND])
  assert.equal(out.filter((d) => d.kind === "track").length, 1)
})
