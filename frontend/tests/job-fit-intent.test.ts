import test from "node:test"
import assert from "node:assert/strict"

import { fitBand, jobFitNextPath } from "../lib/job-fit-intent"

test("jobFitNextPath preserves job context for upload and tailoring", () => {
  assert.equal(jobFitNextPath({ jobId: "j 1", hasReplayableCv: true }), "/cv?jobId=j+1")
  assert.equal(jobFitNextPath({ jobId: "j 1", hasReplayableCv: false }), "/cv?upload=1&jobId=j+1")
})

test("jobFitNextPath falls back safely without a job id", () => {
  assert.equal(jobFitNextPath({ jobId: "", hasReplayableCv: false }), "/cv?upload=1")
  assert.equal(jobFitNextPath({ jobId: null, hasReplayableCv: true }), "/cv?upload=1")
})

test("fitBand mirrors the intel fit scale", () => {
  assert.equal(fitBand(70), "strong")
  assert.equal(fitBand(40), "building")
  assert.equal(fitBand(39), "gap")
})
