/**
 * #56 S3 — one checkout, run for real against a fake Razorpay. Every exit maps
 * to one outcome and nothing hangs (ARCHITECTURE_PAYMENTS.md §6 S3).
 */
import assert from "node:assert/strict"
import test from "node:test"

import { ApiError } from "../lib/api-error"
import { checkout, type CheckoutDeps, type RazorpayCtor } from "../lib/checkout"
import type { RazorpayVerifyResult } from "../lib/api"

type Handlers = {
  succeed: () => void
  fail: (description: string) => void
  dismiss: () => void
}

const ORDER = { order_id: "order_1", amount: 19900, currency: "INR", product: "myro_apply_pack" }
const PAID: RazorpayVerifyResult = {
  success: true,
  coins_earned: 500,
  new_coin_balance: 3500,
  product: "myro_apply_pack",
  myrology_unlocked: false,
  job_switch_plan_active: false,
}

function fakeRazorpay(script: (h: Handlers) => void): RazorpayCtor {
  return class {
    private failedHandler: ((r: { error?: { description?: string } }) => void) | null = null
    constructor(private readonly options: ConstructorParameters<RazorpayCtor>[0]) {}
    on(_event: "payment.failed", handler: (r: { error?: { description?: string } }) => void) {
      this.failedHandler = handler
    }
    open() {
      script({
        succeed: () =>
          this.options.handler({ razorpay_payment_id: "pay_1", razorpay_order_id: "order_1", razorpay_signature: "sig" }),
        fail: (description) => this.failedHandler?.({ error: { description } }),
        dismiss: () => this.options.modal?.ondismiss?.(),
      })
    }
  } as unknown as RazorpayCtor
}

function deps(over: Partial<CheckoutDeps> & { script?: (h: Handlers) => void } = {}): CheckoutDeps {
  const Razorpay = fakeRazorpay(over.script ?? ((h) => h.dismiss()))
  return {
    key: "rzp_test_key",
    openSale: async ({ open }) => {
      await open({ Razorpay, order: ORDER })
      return "opened"
    },
    verify: async () => PAID,
    ...over,
  }
}

const ARGS = { token: "t", product: "apply_pack" as const, name: "Myro", description: "Apply Pack" }

test("a refused order (full queue, gateway closed) is unavailable, never a hang", async () => {
  const outcome = await checkout(ARGS, deps({
    openSale: async () => {
      throw new ApiError("All audit slots are taken this week.", { status: 409, kind: "http" })
    },
  }))
  assert.deepEqual(outcome, { kind: "unavailable", reason: "All audit slots are taken this week." })
})

test("a network failure before the popup is failed, never a hang", async () => {
  const outcome = await checkout(ARGS, deps({
    openSale: async () => {
      throw new ApiError("Payment gateway is temporarily unavailable", { status: 502, kind: "http" })
    },
  }))
  assert.equal(outcome.kind, "failed")
})

test("closing the popup is dismissed", async () => {
  assert.deepEqual(await checkout(ARGS, deps()), { kind: "dismissed" })
})

test("a verified payment is paid, with the new coin balance when coins moved", async () => {
  const outcome = await checkout(ARGS, deps({ script: (h) => h.succeed() }))
  assert.deepEqual(outcome, { kind: "paid", newCoinBalance: 3500 })
})

test("a 202 grant_pending is setting_up", async () => {
  const outcome = await checkout(ARGS, deps({
    script: (h) => h.succeed(),
    verify: async () => ({ outcome: "grant_pending" }),
  }))
  assert.deepEqual(outcome, { kind: "setting_up" })
})

test("a verify that throws after the charge says the payment settles on its own", async () => {
  const outcome = await checkout(ARGS, deps({
    script: (h) => h.succeed(),
    verify: async () => {
      throw new Error("boom")
    },
  }))
  assert.equal(outcome.kind, "failed")
  assert.match(outcome.kind === "failed" ? outcome.reason : "", /settles on its own/)
})

test("a failed attempt then closing the popup is failed with Razorpay's reason", async () => {
  const outcome = await checkout(ARGS, deps({
    script: (h) => {
      h.fail("Card declined")
      h.dismiss()
    },
  }))
  assert.deepEqual(outcome, { kind: "failed", reason: "Card declined" })
})

test("a failed attempt then a successful retry is paid", async () => {
  const outcome = await checkout(ARGS, deps({
    script: (h) => {
      h.fail("Card declined")
      h.succeed()
    },
  }))
  assert.equal(outcome.kind, "paid")
})

test("no public key means no sale, without loading anything", async () => {
  const outcome = await checkout(ARGS, deps({
    key: undefined,
    openSale: async () => assert.fail("must not open a sale without a key"),
  }))
  assert.equal(outcome.kind, "unavailable")
})

test("inside the Android app a sale is absent and reads as unavailable", async () => {
  const outcome = await checkout(ARGS, deps({ openSale: async () => "absent" }))
  assert.equal(outcome.kind, "unavailable")
})
