import { test } from "node:test"
import assert from "node:assert/strict"
import { followGateReason } from "../lib/hooks/use-follow-company"
import { MYRO_COINS_POLICY } from "../lib/xp-policy"

const LIMIT = MYRO_COINS_POLICY.followedCompanyLimit // 10

test("allows a follow when under the slot cap", () => {
  assert.equal(
    followGateReason({ name: "Google", followedNames: ["Acme"], count: 1 }),
    null,
  )
})

test("following is free — a broke user can still follow under the cap", () => {
  // No balance is consulted anymore; only the slot cap gates.
  assert.equal(
    followGateReason({ name: "Google", followedNames: [], count: 0 }),
    null,
  )
})

test("blocks at the compare-slot cap", () => {
  const followed = Array.from({ length: LIMIT }, (_, i) => `Co${i}`)
  assert.equal(
    followGateReason({ name: "Google", followedNames: followed, count: LIMIT }),
    `All ${LIMIT} compare slots in use`,
  )
})

test("already-followed is not a block (returns null, treated as no-op/unfollow)", () => {
  assert.equal(
    followGateReason({ name: "Acme", followedNames: ["Acme"], count: 1 }),
    null,
  )
})
