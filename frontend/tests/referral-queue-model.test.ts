import assert from "node:assert/strict"
import test from "node:test"
import {
  buildReferralLeaders,
  buildReferralQueue,
  buildReferralStatus,
} from "@/components/b2b/referral-model"

test("referral queue sorts higher-confidence intros first", () => {
  const queue = buildReferralQueue("All companies")
  assert.ok(queue[0].score >= queue[1].score)
})

test("referral queue filters to a single company when requested", () => {
  const queue = buildReferralQueue("Razorpay")
  assert.ok(queue.length > 0)
  assert.ok(queue.every((entry) => entry.company === "Razorpay"))
})

test("referral leaders aggregate connector impact", () => {
  const queue = buildReferralQueue("All companies")
  const leaders = buildReferralLeaders(queue)
  const statuses = buildReferralStatus(queue)
  assert.ok(leaders[0].rewards >= leaders[1].rewards)
  assert.equal(statuses.length, 4)
})
