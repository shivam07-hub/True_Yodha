import test from "node:test"
import assert from "node:assert/strict"

import {
  CVUploadFailureBase,
  resolveCVUploadResult,
  type CVUploadPolledStatus,
} from "../lib/cv-upload-state"

const sleep = async (_ms: number) => {}

function makeStatus(over: Partial<CVUploadPolledStatus> = {}): CVUploadPolledStatus {
  return {
    status: "processing",
    skills_detected: null,
    score: null,
    error_code: null,
    error_detail: null,
    xp_charged: 200,
    xp_refunded: false,
    new_coin_balance: 2800,
    redirect_to: null,
    ...over,
  }
}

test("hash-cache hit returns synchronously without polling", async () => {
  let polls = 0
  const result = await resolveCVUploadResult(
    { status: "done", skills_detected: 12, score: 64.2, redirect_to: "/onboarding/score", xp_charged: 0 },
    async () => { polls += 1; return makeStatus({ status: "done" }) },
    { sleep, intervalMs: 1, timeoutMs: 1000, now: () => 0 },
  )

  assert.equal(polls, 0)
  assert.equal(result.skills_detected, 12)
  assert.equal(result.score, 64.2)
  assert.equal(result.xp_charged, 0)
  assert.equal(result.new_coin_balance, null)  // hash-hit path can't know the wallet
})

test("processing → done resolves with status payload", async () => {
  const responses: CVUploadPolledStatus[] = [
    makeStatus({ status: "processing" }),
    makeStatus({ status: "processing" }),
    makeStatus({
      status: "done",
      skills_detected: 7,
      score: 71.5,
      redirect_to: "/onboarding/score",
      new_coin_balance: 2800,
    }),
  ]
  let idx = 0
  const result = await resolveCVUploadResult(
    { status: "processing", job_id: "job-abc" },
    async () => responses[idx++],
    { sleep, intervalMs: 1, timeoutMs: 1000, now: () => 0 },
  )

  assert.equal(idx, 3)
  assert.equal(result.skills_detected, 7)
  assert.equal(result.score, 71.5)
  assert.equal(result.new_coin_balance, 2800)
  assert.equal(result.redirect_to, "/onboarding/score")
})

test("processing → failed throws CVUploadFailure with refund context", async () => {
  let didThrow = false
  try {
    await resolveCVUploadResult(
      { status: "processing", job_id: "job-xyz" },
      async () => makeStatus({
        status: "failed",
        error_code: "provider_unavailable",
        error_detail: "Our CV analysis service was down. Your XP has been refunded — please try again in a few minutes.",
        xp_refunded: true,
        new_coin_balance: 3000,
      }),
      { sleep, intervalMs: 1, timeoutMs: 1000, now: () => 0 },
    )
  } catch (e) {
    didThrow = true
    assert.ok(e instanceof CVUploadFailureBase)
    const err = e as CVUploadFailureBase
    assert.equal(err.code, "provider_unavailable")
    assert.equal(err.xpRefunded, true)
    assert.equal(err.newXpBalance, 3000)
    assert.match(err.message, /tokens have been refunded/i)
    assert.doesNotMatch(err.message, /\bXP\b/)
  }
  assert.ok(didThrow, "must throw on failed status")
})

test("initial failed idempotency replay throws without polling", async () => {
  let polls = 0
  let didThrow = false
  try {
    await resolveCVUploadResult(
      {
        status: "failed",
        error_code: "orphaned",
        error_detail: "Job exceeded 5 min in processing - server restart or stuck worker.",
        xp_charged: 200,
        xp_refunded: true,
        new_coin_balance: null,
      },
      async () => {
        polls += 1
        return makeStatus({ status: "done" })
      },
      { sleep, intervalMs: 1, timeoutMs: 1000, now: () => 0 },
    )
  } catch (e) {
    didThrow = true
    assert.ok(e instanceof CVUploadFailureBase)
    const err = e as CVUploadFailureBase
    assert.equal(err.code, "orphaned")
    assert.equal(err.retryable, false)
    assert.equal(err.xpRefunded, true)
    assert.match(err.message, /stuck worker/i)
  }
  assert.equal(polls, 0)
  assert.ok(didThrow, "must throw on initial failed replay")
})

test("timeout throws once the deadline lapses without a terminal status", async () => {
  let virtualNow = 0
  const fakeSleep = async (ms: number) => { virtualNow += ms }
  let didThrow = false
  try {
    await resolveCVUploadResult(
      { status: "processing", job_id: "job-slow" },
      async () => makeStatus({ status: "processing" }),
      {
        sleep: fakeSleep,
        intervalMs: 1000,
        timeoutMs: 3000,
        now: () => virtualNow,
      },
    )
  } catch (e) {
    didThrow = true
    assert.ok(e instanceof CVUploadFailureBase)
    const err = e as CVUploadFailureBase
    assert.equal(err.code, "poll_timeout")
    assert.equal(err.retryable, true)
  }
  assert.ok(didThrow, "must surface timeout")
})

test("failed status with missing detail falls back to a generic message", async () => {
  let didThrow = false
  try {
    await resolveCVUploadResult(
      { status: "processing", job_id: "j" },
      async () => makeStatus({
        status: "failed",
        error_code: null,
        error_detail: null,
        xp_refunded: false,
        new_coin_balance: 2800,
      }),
      { sleep, intervalMs: 1, timeoutMs: 1000, now: () => 0 },
    )
  } catch (e) {
    didThrow = true
    const err = e as CVUploadFailureBase
    assert.equal(err.code, "unknown")
    assert.equal(err.xpRefunded, false)
    assert.match(err.message, /failed/i)
  }
  assert.ok(didThrow)
})

test("transient poll failures are retried until a terminal status arrives", async () => {
  let call = 0
  const result = await resolveCVUploadResult(
    { status: "processing", job_id: "job-net" },
    async () => {
      call += 1
      if (call <= 2) throw new Error("network blip")
      return makeStatus({ status: "done", skills_detected: 9, score: 67.8, redirect_to: "/onboarding/score" })
    },
    { sleep, intervalMs: 1, timeoutMs: 1000, now: () => 0 },
  )

  assert.equal(call, 3)
  assert.equal(result.skills_detected, 9)
  assert.equal(result.score, 67.8)
})
