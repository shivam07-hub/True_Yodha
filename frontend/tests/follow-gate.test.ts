import { test } from "node:test"
import assert from "node:assert/strict"
import { followGateReason } from "../lib/hooks/use-follow-company"
import { XP_POLICY } from "../lib/xp-policy"

const LIMIT = XP_POLICY.followedCompanyLimit // 10
const COST = XP_POLICY.followCompanyCost // 10
const FLOOR = XP_POLICY.followCompanyFloor // -30

test("allows a follow when under cap and funded", () => {
  assert.equal(
    followGateReason({ name: "Google", followedNames: ["Acme"], count: 1, balance: 100 }),
    null,
  )
})

test("blocks at the company cap", () => {
  const followed = Array.from({ length: LIMIT }, (_, i) => `Co${i}`)
  assert.equal(
    followGateReason({ name: "Google", followedNames: followed, count: LIMIT, balance: 9999 }),
    `Heatmap limit ${LIMIT}`,
  )
})

test("blocks when the next charge would breach the token floor", () => {
  // balance - cost must be >= floor. At floor + cost - 1 it breaches.
  const balance = FLOOR + COST - 1 // -21: -21 - 10 = -31 < -30
  assert.equal(
    followGateReason({ name: "Google", followedNames: [], count: 0, balance }),
    "Not enough tokens",
  )
})

test("allows exactly at the floor boundary", () => {
  const balance = FLOOR + COST // -20: -20 - 10 = -30 == floor, allowed
  assert.equal(
    followGateReason({ name: "Google", followedNames: [], count: 0, balance }),
    null,
  )
})

test("already-followed is not a block (returns null, treated as no-op/unfollow)", () => {
  assert.equal(
    followGateReason({ name: "Acme", followedNames: ["Acme"], count: 1, balance: -999 }),
    null,
  )
})

test("cap takes precedence over tokens when both would block", () => {
  const followed = Array.from({ length: LIMIT }, (_, i) => `Co${i}`)
  assert.equal(
    followGateReason({ name: "Google", followedNames: followed, count: LIMIT, balance: -999 }),
    `Heatmap limit ${LIMIT}`,
  )
})
