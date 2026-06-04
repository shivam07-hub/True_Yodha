import test from "node:test"
import assert from "node:assert/strict"

import { foldIdleGap, reconcileForgeClock } from "../lib/forge-clock"

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

test("foldIdleGap leaves pausedMs untouched on a normal foreground heartbeat", () => {
  // ~1s since last tick — below grace, real foreground time, must accrue.
  assert.equal(foldIdleGap(0, true, 10_000, 11_000), 0)
})

test("foldIdleGap excludes a long background/closed-tab gap", () => {
  // Last heartbeat at 10s, reconciled 60s later (tab was hidden) → exclude the
  // gap minus one expected heartbeat.
  const gap = 60_000 - 10_000
  assert.equal(foldIdleGap(0, true, 10_000, 60_000), gap - 1000)
})

test("foldIdleGap is a no-op while paused", () => {
  assert.equal(foldIdleGap(5_000, false, 10_000, 9_999_999), 5_000)
})

test("idle gap is excluded from earned minutes when a stale session is reopened", () => {
  // 10 foreground minutes, tab closed for 2 days, then reopened and reconciled.
  // Only the 10 real minutes may count — not the 2 days of wall clock.
  const lastTickAt = 10 * 60_000
  const now = lastTickAt + 2 * 24 * 60 * 60_000
  const pausedMs = foldIdleGap(0, true, lastTickAt, now)
  const next = reconcileForgeClock({
    durationSeconds: DURATION,
    sessionActive: true,
    running: true,
    startedAt: 0,
    pausedAt: null,
    pausedMs,
    claimedMinutes: 0,
    carriedMinutes: 0,
    lastTickAt,
  }, now)

  assert.equal(next.pendingMinutes, 10)
})
