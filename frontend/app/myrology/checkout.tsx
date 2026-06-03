"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"

import { billing, myrology, users, type MyrologyBooking, type MyrologyIntake, type MyrologyIntakePayload } from "@/lib/api"
import { getAccessToken } from "@/lib/session"

// Logged-out visitors must keep this public page; bounce them to signup with a
// return hop instead of mounting useAuth (which auto-redirects to /login).
const SIGNUP_HREF = "/signup?next=/myrology"

type Phase = "loading" | "locked" | "intake" | "booking"
type PayStatus = "idle" | "starting" | "verifying" | "error"

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

interface MyrologyValue {
  phase: Phase
  payStatus: PayStatus
  payError: string | null
  intake: MyrologyIntake | null
  bookings: MyrologyBooking[]
  start: () => void
  saveIntake: (payload: MyrologyIntakePayload) => Promise<void>
  createBooking: (payload: { preferred_windows: string; topic: string | null }) => Promise<void>
}

const MyrologyContext = createContext<MyrologyValue | null>(null)

export function MyrologyProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>("loading")
  const [payStatus, setPayStatus] = useState<PayStatus>("idle")
  const [payError, setPayError] = useState<string | null>(null)
  const [intake, setIntake] = useState<MyrologyIntake | null>(null)
  const [bookings, setBookings] = useState<MyrologyBooking[]>([])

  const loadUnlockedState = useCallback(async (token: string) => {
    const [intakeRow, bookingList] = await Promise.all([myrology.getIntake(token), myrology.getBookings(token)])
    setIntake(intakeRow)
    setBookings(bookingList.bookings)
    setPhase(intakeRow ? "booking" : "intake")
  }, [])

  // Resolve phase on mount: logged-out / not-unlocked => locked marketing page.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const token = getAccessToken()
      if (!token) {
        if (!cancelled) setPhase("locked")
        return
      }
      try {
        const profile = await users.me(token)
        if (cancelled) return
        if (!profile.myrology_unlocked) {
          setPhase("locked")
          return
        }
        await loadUnlockedState(token)
      } catch {
        if (!cancelled) setPhase("locked")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadUnlockedState])

  const start = useCallback(() => {
    setPayError(null)
    const token = getAccessToken()
    if (!token) {
      router.push(SIGNUP_HREF)
      return
    }

    const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
    const Razorpay = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay
    if (!key) {
      setPayStatus("error")
      setPayError("Payments aren’t configured yet.")
      return
    }
    if (!Razorpay) {
      setPayStatus("error")
      setPayError("Checkout is still loading — try again in a moment.")
      return
    }

    setPayStatus("starting")
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
              if (!completed) setPayStatus("idle")
            },
          },
          handler: (response) => {
            completed = true
            setPayStatus("verifying")
            void (async () => {
              try {
                const verified = await billing.verifyPayment(token, response)
                if (verified.myrology_unlocked) {
                  setPayStatus("idle")
                  await loadUnlockedState(token)
                } else {
                  setPayStatus("error")
                  setPayError("Payment captured but the unlock didn’t apply. Contact support — we’ll sort it.")
                }
              } catch {
                setPayStatus("error")
                setPayError("We couldn’t confirm the payment. If you were charged it will reconcile shortly.")
              }
            })()
          },
        })

        checkout.on("payment.failed", (response) => {
          completed = true
          setPayStatus("error")
          setPayError(response.error?.description || response.error?.reason || "Payment failed. Please retry.")
        })

        checkout.open()
      } catch {
        setPayStatus("error")
        setPayError("Couldn’t start checkout. Please retry.")
      }
    })()
  }, [router, loadUnlockedState])

  const saveIntake = useCallback(async (payload: MyrologyIntakePayload) => {
    const token = getAccessToken()
    if (!token) {
      router.push(SIGNUP_HREF)
      return
    }
    const saved = await myrology.saveIntake(token, payload)
    setIntake(saved)
    setPhase("booking")
  }, [router])

  const createBooking = useCallback(async (payload: { preferred_windows: string; topic: string | null }) => {
    const token = getAccessToken()
    if (!token) {
      router.push(SIGNUP_HREF)
      return
    }
    const created = await myrology.createBooking(token, payload)
    setBookings((prev) => [created, ...prev])
  }, [router])

  return (
    <MyrologyContext.Provider
      value={{ phase, payStatus, payError, intake, bookings, start, saveIntake, createBooking }}
    >
      {children}
    </MyrologyContext.Provider>
  )
}

export function useMyrology(): MyrologyValue {
  const value = useContext(MyrologyContext)
  if (!value) throw new Error("useMyrology must be used inside MyrologyProvider")
  return value
}

/** Renders children only before unlock — pay CTAs, marketing scarcity, etc. */
export function LockedOnly({ children }: { children: ReactNode }) {
  const { phase } = useMyrology()
  if (phase === "intake" || phase === "booking") return null
  return <>{children}</>
}

export function MyrologyCta({ variant }: { variant: "price" | "bridge" }) {
  const { payStatus, payError, start } = useMyrology()
  const busy = payStatus === "starting" || payStatus === "verifying"

  if (variant === "bridge") {
    return (
      <button type="button" className="bridge-cta" onClick={start} disabled={busy} data-state={payStatus}>
        <div className="bridge-price">
          <span className="mono big">₹499</span>
          <span className="bridge-once">one-time</span>
        </div>
        <span className="bridge-arrow">{busy ? "Processing…" : "Pay & start →"}</span>
      </button>
    )
  }

  const priceLabel =
    payStatus === "verifying"
      ? "Verifying payment…"
      : payStatus === "starting"
        ? "Opening checkout…"
        : "Unlock Myrology · Pay ₹499 →"

  return (
    <>
      <button type="button" className="price-cta" onClick={start} disabled={busy} data-state={payStatus}>
        {priceLabel}
      </button>
      <div className="price-cta-meta">
        {payError ? (
          <span className="cta-error">{payError}</span>
        ) : (
          <>
            <span>Secured by Razorpay · UPI · cards · wallets</span>
            <span className="mono">Non-refundable</span>
          </>
        )}
      </div>
      <p className="price-cta-terms">
        By paying, you agree to Myro&rsquo;s{" "}
        <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
        {" "}and{" "}
        <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
      </p>
    </>
  )
}
