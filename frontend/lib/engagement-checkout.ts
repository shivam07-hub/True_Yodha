import { billing } from "@/lib/api"
import { openSale } from "@/lib/sale"

interface RazorpaySuccess {
  razorpay_payment_id: string
  razorpay_order_id?: string
  razorpay_subscription_id?: string
  razorpay_signature: string
}

interface RazorpayOptions {
  key: string
  subscription_id: string
  name: string
  description: string
  theme?: { color?: string }
  modal?: { confirm_close?: boolean; ondismiss?: () => void }
  handler: (r: RazorpaySuccess) => void
}

interface RazorpayInstance {
  open: () => void
  on: (e: "payment.failed", h: (r: { error?: { description?: string; reason?: string } }) => void) => void
}

type RazorpayCtor = new (o: RazorpayOptions) => RazorpayInstance

export type EngagementCheckoutResult = "active" | "dismissed" | "failed"

export async function startEngagementCheckout(args: {
  token: string
  key: string
  onVerifying: () => void
  onFailed: (message: string) => void
  onDismiss: () => void
}): Promise<EngagementCheckoutResult> {
  let outcome: EngagementCheckoutResult = "failed"
  const result = await openSale<RazorpayCtor>({
    token: args.token,
    product: "job_switch_plan",
    open: ({ Razorpay, order }) => new Promise<void>((resolve) => {
      const subscriptionId = order.subscription_id || order.order_id
      let completed = false
      const checkout = new Razorpay({
        key: args.key,
        subscription_id: subscriptionId,
        name: "Myro · Personalised Engagement",
        description: "Keep a person on this scene · ₹199 / month",
        theme: { color: "#4fc7f6" },
        modal: {
          confirm_close: true,
          ondismiss: () => {
            if (!completed) {
              args.onDismiss()
              outcome = "dismissed"
              resolve()
            }
          },
        },
        handler: (response) => {
          completed = true
          args.onVerifying()
          void (async () => {
            try {
              const verified = await billing.verifyPayment(args.token, {
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: order.order_id,
                razorpay_subscription_id: response.razorpay_subscription_id || subscriptionId,
                razorpay_signature: response.razorpay_signature,
              })
              outcome = verified.job_switch_plan_active ? "active" : "failed"
              if (outcome === "failed") {
                args.onFailed("Payment captured but the scene didn't activate. Contact support.")
              }
            } catch {
              outcome = "failed"
              args.onFailed("We couldn't confirm the payment. If you were charged it will reconcile shortly.")
            } finally {
              resolve()
            }
          })()
        },
      })
      checkout.on("payment.failed", (r) => {
        completed = true
        outcome = "failed"
        args.onFailed(r.error?.description || r.error?.reason || "Payment failed. Please retry.")
        resolve()
      })
      checkout.open()
    }),
  })
  if (result === "absent") return "dismissed"
  if (result === "unavailable") {
    args.onFailed("Checkout isn't available right now. Please try again shortly.")
    return "failed"
  }
  return outcome
}
