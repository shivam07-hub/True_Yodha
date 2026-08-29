import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import type { JobMatch } from "../lib/api"
import { matchFitScore, pickBestMatch, strongMatches, verdictLabel, verdictMove } from "../lib/jobs/match-verdict"

function job(over: Partial<JobMatch>): JobMatch {
  return { match_score: 50, verdict: "worth_it", is_strong: false, ...over } as JobMatch
}

test("strongMatches keeps only verdict==strong", () => {
  const jobs = [
    job({ job_id: "a", is_strong: true }),
    job({ job_id: "b", is_strong: false }),
  ]
  assert.deepEqual(strongMatches(jobs).map((j) => j.job_id), ["a"])
})

test("pickBestMatch prefers the highest-scoring strong match", () => {
  const jobs = [
    job({ job_id: "weak-strong", is_strong: true, match_score: 62 }),
    job({ job_id: "top-strong", is_strong: true, match_score: 88 }),
    job({ job_id: "high-nonstrong", is_strong: false, match_score: 95 }),
  ]
  assert.equal(pickBestMatch(jobs)?.job_id, "top-strong")
})

test("pickBestMatch never returns an empty hand — closest by score when no strong", () => {
  const jobs = [
    job({ job_id: "closest", is_strong: false, match_score: 48 }),
    job({ job_id: "farther", is_strong: false, match_score: 33 }),
  ]
  assert.equal(pickBestMatch(jobs)?.job_id, "closest")
})

test("pickBestMatch returns null only with no matches", () => {
  assert.equal(pickBestMatch([]), null)
})

test("every REACHED verdict has a non-empty label", () => {
  for (const v of ["strong", "worth_it", "stretch"] as const) {
    assert.ok((verdictLabel(v) ?? "").length > 0)
  }
  assert.equal(verdictLabel("worth_it"), "Worth it")
})

test("`checking` has no word, because nothing is checking", () => {
  // It used to read "Checking fit…" — a loading state a row can sit in
  // permanently: a run keeps 20 rows per search and the brain deep-reads 8, so
  // twelve stay unread until someone opens them. The market card dodged it by
  // falling back to the overlap view; the mobile row rendered the word, so one
  // surface claimed a check was in progress while the divider above it said
  // "Not read yet".
  assert.equal(verdictLabel("checking"), null)
})

test("no surface prints a word for a verdict that has none", () => {
  // The rule is the compiler's now, but the two callers are worth naming: both
  // must go through a guard rather than interpolating the result.
  const read = (path: string) =>
    readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
  const mobile = read("mobile/redesign/job-model.ts")
  assert.match(mobile, /\(verdict && verdictLabel\(verdict\)\) \|\| ""/)
  // The market card only reaches the word through `fit.kind === "score"`, which
  // `card-view` sets only for a verdict that is not `checking`.
  assert.match(read("lib/jobs/card-view.ts"), /job\.verdict && job\.verdict !== "checking"/)
})

// Backlog #36 Slice 3 — the canonical fit number + move seam every surface reads.

test("matchFitScore reads match_score (0-100), never overall_score (0-5 scale)", () => {
  // A warmed card carries both; match_score is the brain-spined percent.
  assert.equal(matchFitScore({ match_score: 82, overlap_score: 40 }), 82)
})

test("matchFitScore falls back to overlap_score (also 0-100), then 0", () => {
  assert.equal(matchFitScore({ match_score: null, overlap_score: 55 }), 55)
  assert.equal(matchFitScore({}), 0)
})

test("verdictMove: strong/worth_it → tailor & apply (go)", () => {
  assert.deepEqual(verdictMove("strong", 3), { label: "Tailor & apply", kind: "go" })
  assert.deepEqual(verdictMove("worth_it", 0), { label: "Tailor & apply", kind: "go" })
})

test("verdictMove: stretch names the real work by gap count", () => {
  assert.deepEqual(verdictMove("stretch", 2), { label: "Close 2 gaps first", kind: "gap" })
  assert.deepEqual(verdictMove("stretch", 1), { label: "Close 1 gap first", kind: "gap" })
  assert.deepEqual(verdictMove("stretch", 0), { label: "A stretch for now", kind: "gap" })
})

test("verdictMove: un-warmed / checking has no move (null) — no score-band guess", () => {
  assert.equal(verdictMove(null, 5), null)
  assert.equal(verdictMove(undefined, 5), null)
  assert.equal(verdictMove("checking", 5), null)
})
