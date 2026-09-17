import { billing, type RazorpayOrderResponse } from "@/lib/api"
import { loadRazorpay } from "@/lib/razorpay"

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
  const Razorpay = await loadRazorpay<RazorpayCtor>()
  if (!Razorpay) {
    args.onFailed("Checkout isn't available right now. Please try again shortly.")
    return "failed"
  }
  const order: RazorpayOrderResponse = await billing.createOrder(args.token, "job_switch_plan")
  const subscriptionId = order.subscription_id || order.order_id
  let completed = false
  return new Promise((resolve) => {
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
            resolve("dismissed")
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
            if (verified.job_switch_plan_active) {
              resolve("active")
              return
            }
            args.onFailed("Payment captured but the scene didn't activate. Contact support.")
            resolve("failed")
          } catch {
            args.onFailed("We couldn't confirm the payment. If you were charged it will reconcile shortly.")
            resolve("failed")
          }
        })()
      },
    })
    checkout.on("payment.failed", (r) => {
      completed = true
      args.onFailed(r.error?.description || r.error?.reason || "Payment failed. Please retry.")
      resolve("failed")
    })
    checkout.open()
  })
}
