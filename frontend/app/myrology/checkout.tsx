"use client"

import { createContext, useCallback, useContext, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"

import { billing } from "@/lib/api"
import { getAccessToken } from "@/lib/session"

// Logged-out visitors must keep this public page; bounce them to signup with a
// return hop instead of mounting useAuth (which auto-redirects to /login).
const SIGNUP_HREF = "/signup?next=/myrology"

type CheckoutStatus = "idle" | "starting" | "verifying" | "unlocked" | "error"

interface RazorpaySuccess {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

interface RazorpayOptions {
  key: string
  amount: number
  currency: string
  name: string
  description: string
  order_id: string
  theme?: { color?: string; backdrop_color?: string }
  modal?: { confirm_close?: boolean; ondismiss?: () => void }
  handler: (response: RazorpaySuccess) => void
}

interface RazorpayInstance {
  open: () => void
  on: (event: "payment.failed", handler: (response: { error?: { description?: string; reason?: string } }) => void) => void
}

type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayInstance

interface CheckoutValue {
  status: CheckoutStatus
  error: string | null
  start: () => void
}

const CheckoutContext = createContext<CheckoutValue | null>(null)

export function MyrologyCheckoutProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [status, setStatus] = useState<CheckoutStatus>("idle")
  const [error, setError] = useState<string | null>(null)

  const start = useCallback(() => {
    setError(null)

    const token = getAccessToken()
    if (!token) {
      router.push(SIGNUP_HREF)
      return
    }

    const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
    const Razorpay = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay
    if (!key) {
      setStatus("error")
      setError("Payments aren’t configured yet.")
      return
    }
    if (!Razorpay) {
      setStatus("error")
      setError("Checkout is still loading — try again in a moment.")
      return
    }

    setStatus("starting")
    void (async () => {
      try {
        const order = await billing.createOrder(token, "myrology")
        let completed = false

        const checkout = new Razorpay({
          key,
          amount: order.amount,
          currency: order.currency,
          name: "Myro · Myrology",
          description: "Myrology unlock · 3 sessions + report",
          order_id: order.order_id,
          theme: { color: "#B084FF", backdrop_color: "#05060f" },
          modal: {
            confirm_close: true,
            ondismiss: () => {
              if (!completed) setStatus("idle")
            },
          },
          handler: (response) => {
            completed = true
            setStatus("verifying")
            void (async () => {
              try {
                const verified = await billing.verifyPayment(token, response)
                if (verified.myrology_unlocked) {
                  setStatus("unlocked")
                } else {
                  setStatus("error")
                  setError("Payment captured but the unlock didn’t apply. Contact support — we’ll sort it.")
                }
              } catch {
                setStatus("error")
                setError("We couldn’t confirm the payment. If you were charged it will reconcile shortly.")
              }
            })()
          },
        })

        checkout.on("payment.failed", (response) => {
          completed = true
          setStatus("error")
          setError(response.error?.description || response.error?.reason || "Payment failed. Please retry.")
        })

        checkout.open()
      } catch {
        setStatus("error")
        setError("Couldn’t start checkout. Please retry.")
      }
    })()
  }, [router])

  return <CheckoutContext.Provider value={{ status, error, start }}>{children}</CheckoutContext.Provider>
}

function useCheckout(): CheckoutValue {
  const value = useContext(CheckoutContext)
  if (!value) throw new Error("MyrologyCta must render inside MyrologyCheckoutProvider")
  return value
}

export function MyrologyCta({ variant }: { variant: "price" | "bridge" }) {
  const { status, error, start } = useCheckout()
  const busy = status === "starting" || status === "verifying"
  const unlocked = status === "unlocked"

  if (variant === "bridge") {
    return (
      <button type="button" className="bridge-cta" onClick={start} disabled={busy || unlocked} data-state={status}>
        <div className="bridge-price">
          <span className="mono big">₹499</span>
          <span className="bridge-once">one-time</span>
        </div>
        <span className="bridge-arrow">
          {unlocked ? "Unlocked ✓" : busy ? "Processing…" : "Pay & start →"}
        </span>
      </button>
    )
  }

  const priceLabel = unlocked
    ? "Myrology unlocked ✓"
    : status === "verifying"
      ? "Verifying payment…"
      : status === "starting"
        ? "Opening checkout…"
        : "Unlock Myrology · Pay ₹499 →"

  return (
    <>
      <button type="button" className="price-cta" onClick={start} disabled={busy || unlocked} data-state={status}>
        {priceLabel}
      </button>
      <div className="price-cta-meta">
        {error ? (
          <span className="cta-error">{error}</span>
        ) : unlocked ? (
          <span className="cta-ok">Next: we’ll collect your birth details.</span>
        ) : (
          <>
            <span>Secured by Razorpay · UPI · cards · wallets</span>
            <span className="mono">7-day refund</span>
          </>
        )}
      </div>
    </>
  )
}
