import test from "node:test"
import assert from "node:assert/strict"

import { reconcileForgeClock } from "../lib/forge-clock"

const DURATION = 25 * 60

test("reconcileForgeClock derives elapsed time from wall clock", () => {
  const next = reconcileForgeClock({
    durationSeconds: DURATION,
    sessionActive: true,
    running: true,
    startedAt: 0,
    pausedAt: null,
    pausedMs: 0,
    claimedMinutes: 0,
    carriedMinutes: 0,
    lastTickAt: 0,
  }, 90_000)

  assert.equal(next.remaining, DURATION - 90)
  assert.equal(next.pendingMinutes, 1)
  assert.equal(next.lastTickAt, 90_000)
})

test("reconcileForgeClock excludes time spent paused", () => {
  const next = reconcileForgeClock({
    durationSeconds: DURATION,
    sessionActive: true,
    running: false,
    startedAt: 0,
    pausedAt: 30_000,
    pausedMs: 0,
    claimedMinutes: 0,
    carriedMinutes: 0,
    lastTickAt: 30_000,
  }, 120_000)

  assert.equal(next.remaining, DURATION - 30)
  assert.equal(next.pendingMinutes, 0)
  assert.equal(next.lastTickAt, 30_000)
})

test("reconcileForgeClock rolls over 25-minute units without losing minutes", () => {
  const next = reconcileForgeClock({
    durationSeconds: DURATION,
    sessionActive: true,
    running: true,
    startedAt: 0,
    pausedAt: null,
    pausedMs: 0,
    claimedMinutes: 0,
    carriedMinutes: 0,
    lastTickAt: 0,
  }, 26 * 60_000)

  assert.equal(next.remaining, DURATION - 60)
  assert.equal(next.pendingMinutes, 26)
})

test("reconcileForgeClock keeps carried unclaimed minutes through restarts", () => {
  const next = reconcileForgeClock({
    durationSeconds: DURATION,
    sessionActive: true,
    running: true,
    startedAt: 0,
    pausedAt: null,
    pausedMs: 0,
    claimedMinutes: 1,
    carriedMinutes: 3,
    lastTickAt: 0,
  }, 2 * 60_000)

  assert.equal(next.pendingMinutes, 4)
})
