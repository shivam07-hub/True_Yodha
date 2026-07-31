"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"

import { billing, myrology, users, type MyrologyBooking, type MyrologyIntake, type MyrologyIntakePayload } from "@/lib/api"
import { getAccessToken } from "@/lib/session"
import { loadRazorpay } from "@/lib/razorpay"

// Logged-out visitors must keep this public page; bounce them to signup
// instead of mounting useAuth (which auto-redirects to /login). Post-auth
// landing is decided by carried intent, so they return here by navigating.
const SIGNUP_HREF = "/signup"

// Flow: locked (marketing) → intake (birth details, FREE) → pay (₹299) → booking
// (confirm + session requests). Intake now precedes payment.
type Phase = "loading" | "locked" | "intake" | "pay" | "booking"
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
  authed: boolean
  payStatus: PayStatus
  payError: string | null
  intake: MyrologyIntake | null
  bookings: MyrologyBooking[]
  begin: () => void
  start: () => void
  saveIntake: (payload: MyrologyIntakePayload) => Promise<void>
  createBooking: (payload: { preferred_windows: string; topic: string | null }) => Promise<void>
}

const MyrologyContext = createContext<MyrologyValue | null>(null)

export function MyrologyProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>("loading")
  const [authed, setAuthed] = useState(false)
  const [payStatus, setPayStatus] = useState<PayStatus>("idle")
  const [payError, setPayError] = useState<string | null>(null)
  const [intake, setIntake] = useState<MyrologyIntake | null>(null)
  const [bookings, setBookings] = useState<MyrologyBooking[]>([])

  // Paid surface: confirmation + session requests live here.
  const loadUnlockedState = useCallback(async (token: string) => {
    const [intakeRow, bookingList] = await Promise.all([myrology.getIntake(token), myrology.getBookings(token)])
    setIntake(intakeRow)
    setBookings(bookingList.bookings)
    setPhase("booking")
  }, [])

  // Resolve phase on mount. Intake now precedes payment, so a logged-in,
  // not-yet-paid user lands on `pay` if they already saved details, otherwise
  // on the `locked` marketing page (whose CTA starts intake rather than signup).
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
        setAuthed(true)
        if (profile.myrology_unlocked) {
          await loadUnlockedState(token)
          return
        }
        const intakeRow = await myrology.getIntake(token)
        if (cancelled) return
        setIntake(intakeRow)
        setPhase(intakeRow ? "pay" : "locked")
      } catch {
        if (!cancelled) setPhase("locked")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadUnlockedState])

  // Entry from the marketing CTA: logged-out → signup; logged-in → intake form.
  const begin = useCallback(() => {
    const token = getAccessToken()
    if (!token) {
      router.push(SIGNUP_HREF)
      return
    }
    setPhase("intake")
  }, [router])

  const start = useCallback(() => {
    setPayError(null)
    const token = getAccessToken()
    if (!token) {
      router.push(SIGNUP_HREF)
      return
    }

    const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
    if (!key) {
      setPayStatus("error")
      setPayError("Payments aren’t configured yet.")
      return
    }
    setPayStatus("starting")
    void (async () => {
      try {
        const Razorpay = await loadRazorpay<RazorpayConstructor>()
        if (!Razorpay) {
          setPayStatus("error")
          setPayError("Checkout is unavailable. Try again in a moment.")
          return
        }
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
    setPhase("pay")
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
      value={{ phase, authed, payStatus, payError, intake, bookings, begin, start, saveIntake, createBooking }}
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

/** Renders children only on the locked marketing page (pre-intake). */
export function LockedOnly({ children }: { children: ReactNode }) {
  const { phase } = useMyrology()
  if (phase !== "locked") return null
  return <>{children}</>
}

export function MyrologyCta({ variant }: { variant: "price" | "pay" | "bridge" }) {
  const { payStatus, payError, begin, start } = useMyrology()
  const busy = payStatus === "starting" || payStatus === "verifying"

  // Marketing entry: free birth-details first, payment comes after.
  if (variant === "price") {
    return (
      <>
        <button type="button" className="price-cta" onClick={begin}>
          Start — enter your birth details →
        </button>
        <div className="price-cta-meta">
          <span>Free to start · pay ₹299 after your details</span>
        </div>
      </>
    )
  }

  if (variant === "bridge") {
    return (
      <button type="button" className="bridge-cta" onClick={start} disabled={busy} data-state={payStatus}>
        <div className="bridge-price">
          <span className="mono big">₹299</span>
          <span className="bridge-once">one-time</span>
        </div>
        <span className="bridge-arrow">{busy ? "Processing…" : "Pay & start →"}</span>
      </button>
    )
  }

  // variant === "pay": the real checkout, shown after intake is saved.
  const payLabel =
    payStatus === "verifying"
      ? "Verifying payment…"
      : payStatus === "starting"
        ? "Opening checkout…"
        : "Pay ₹299 · unlock my sessions →"

  return (
    <>
      <button type="button" className="price-cta" onClick={start} disabled={busy} data-state={payStatus}>
        {payLabel}
      </button>
      <div className="price-cta-meta">
        {payError ? (
          <span className="cta-error">{payError}</span>
        ) : (
          <span>Secured by Razorpay · UPI · cards · wallets</span>
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
