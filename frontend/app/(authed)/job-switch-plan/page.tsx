"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Compass, ArrowRight, CheckCircle2 } from "lucide-react"
import { billing, jobSwitchPlan, type JobSwitchPlan } from "@/lib/api"
import { getAccessToken } from "@/lib/session"
import { loadRazorpay } from "@/lib/razorpay"
import { formatDate } from "@/lib/format"
import "./job-switch-plan.css"

/* ₹99 Personalised Job-Switch Plan surface (#33). Two states:
   no plan → the ₹99 offer + Razorpay checkout; has plan → the living plan meta,
   the two-review lifecycle (B6), and the on-demand second-review request. The
   living SKILL content lives on Practice (/forge) — this page links there rather
   than duplicating the gap engine. Razorpay loads only after checkout starts. */

const POINTS = [
  "A personalised plan built from the exact gaps between your CV and the role you want",
  "A levelled path to close them — upskill or cross-skill, step by step",
  "Two human reviews within 120 days — a real coach reads your plan, not just the algorithm",
]

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
  theme?: { color?: string }
  modal?: { confirm_close?: boolean; ondismiss?: () => void }
  handler: (r: RazorpaySuccess) => void
}
interface RazorpayInstance {
  open: () => void
  on: (e: "payment.failed", h: (r: { error?: { description?: string; reason?: string } }) => void) => void
}
type RazorpayCtor = new (o: RazorpayOptions) => RazorpayInstance

type PayStatus = "idle" | "starting" | "verifying"

export default function JobSwitchPlanPage() {
  const router = useRouter()
  const [plan, setPlan] = useState<JobSwitchPlan | null | undefined>(undefined) // undefined = loading
  const [payStatus, setPayStatus] = useState<PayStatus>("idle")
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const token = getAccessToken()
    if (!token) {
      router.push("/login")
      return
    }
    try {
      setPlan(await jobSwitchPlan.get(token))
    } catch {
      setError("Couldn't load your plan. Refresh to retry.")
      setPlan(null)
    }
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  const startCheckout = useCallback(() => {
    setError(null)
    const token = getAccessToken()
    if (!token) {
      router.push("/login")
      return
    }
    const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
    if (!key) {
      setError("Checkout isn't available right now. Please try again shortly.")
      return
    }
    setPayStatus("starting")
    void (async () => {
      try {
        const Razorpay = await loadRazorpay<RazorpayCtor>()
        if (!Razorpay) {
          setPayStatus("idle")
          setError("Checkout isn't available right now. Please try again shortly.")
          return
        }
        const order = await billing.createOrder(token, "job_switch_plan")
        let completed = false
        const checkout = new Razorpay({
          key,
          amount: order.amount,
          currency: order.currency,
          name: "Myro · Job-Switch Plan",
          description: "Personalised Job-Switch Plan — intro",
          order_id: order.order_id,
          theme: { color: "#FF4C00" },
          modal: { confirm_close: true, ondismiss: () => { if (!completed) setPayStatus("idle") } },
          handler: (response) => {
            completed = true
            setPayStatus("verifying")
            void (async () => {
              try {
                const verified = await billing.verifyPayment(token, response)
                if (verified.job_switch_plan_active) {
                  setPayStatus("idle")
                  await load()
                } else {
                  setPayStatus("idle")
                  setError("Payment captured but the plan didn't activate. Contact support — we'll sort it.")
                }
              } catch {
                setPayStatus("idle")
                setError("We couldn't confirm the payment. If you were charged it will reconcile shortly.")
              }
            })()
          },
        })
        checkout.on("payment.failed", (r) => {
          completed = true
          setPayStatus("idle")
          setError(r.error?.description || r.error?.reason || "Payment failed. Please retry.")
        })
        checkout.open()
      } catch {
        setPayStatus("idle")
        setError("Couldn't start checkout. Please retry.")
      }
    })()
  }, [router, load])

  const requestSecond = useCallback(async () => {
    const token = getAccessToken()
    if (!token) return
    setRequesting(true)
    setError(null)
    try {
      await jobSwitchPlan.requestReview(token)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't request the review.")
    } finally {
      setRequesting(false)
    }
  }, [load])

  return (
    <div className="jsp-wrap">
      <span className="jsp-kicker">Personalised Job-Switch Plan</span>

      {plan === undefined && <div className="jsp-skeleton" style={{ marginTop: 24 }} />}

      {plan === null && (
        <>
          <h1 className="jsp-title">Close the gap to the job you want.</h1>
          <p className="jsp-sub">
            A guided path to make you the obvious hire. We don&apos;t place you — we close the gap
            so you can. Your plan is ready instantly; a Myro coach adds a personalised review within
            5 working days.
          </p>
          <div className="jsp-card">
            <ul className="jsp-points">
              {POINTS.map((p) => <li key={p}>{p}</li>)}
            </ul>
            <div className="jsp-offer-foot">
              <span className="jsp-price">
                <strong>₹99</strong> to start <span className="jsp-price-note">intro price</span>
              </span>
              <button className="jsp-btn" onClick={startCheckout} disabled={payStatus !== "idle"}>
                {payStatus === "starting" ? "Opening checkout…" : payStatus === "verifying" ? "Confirming…" : "Start my plan"}
                <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
              </button>
            </div>
            {error && <p className="jsp-error">{error}</p>}
          </div>
        </>
      )}

      {plan && (
        <>
          <h1 className="jsp-title">Your Job-Switch Plan.</h1>
          <div className="jsp-card">
            <div className="jsp-meta-row">
              <div className="jsp-meta">
                <span className="jsp-meta-k">Target role</span>
                <span className="jsp-meta-v">{plan.target_role || "Set in your job feed"}</span>
              </div>
              <div className="jsp-meta">
                <span className="jsp-meta-k">Reviews used</span>
                <span className="jsp-meta-v">{plan.reviews_used} / 2</span>
              </div>
              <div className="jsp-meta">
                <span className="jsp-meta-k">Review window</span>
                <span className="jsp-meta-v">
                  {plan.window_open ? `open until ${formatDate(plan.window_expires_at)}` : "closed"}
                </span>
              </div>
            </div>
          </div>

          <div className="jsp-card">
            <div className="jsp-reviews">
              {plan.reviews.length === 0 && (
                <p className="jsp-note">Your first review is being prepared.</p>
              )}
              {plan.reviews.map((r) => (
                <div className="jsp-review" key={r.id}>
                  <div className="jsp-review-head">
                    <span className="jsp-review-no">
                      {r.status === "delivered" && <CheckCircle2 size={15} strokeWidth={2} aria-hidden style={{ verticalAlign: "-2px", marginRight: 6 }} />}
                      Review {r.review_no}
                    </span>
                    <span className="jsp-pill" data-status={r.status}>
                      {r.status === "in_progress" ? "in progress" : r.status}
                    </span>
                  </div>
                  {r.status === "delivered" && r.review_text ? (
                    <p className="jsp-review-text">{r.review_text}</p>
                  ) : (
                    <p className="jsp-review-sla">A Myro coach will respond by {formatDate(r.sla_due_at)}.</p>
                  )}
                </div>
              ))}
            </div>

            <div className="jsp-actions">
              <button
                className="jsp-btn"
                onClick={requestSecond}
                disabled={!plan.can_request_second_review || requesting}
              >
                {requesting ? "Requesting…" : "Request your second review"}
              </button>
              <Link className="jsp-btn jsp-btn-ghost" href="/practice">
                <Compass size={16} strokeWidth={1.5} aria-hidden />
                Work your plan in Practice
              </Link>
            </div>
            {!plan.can_request_second_review && plan.reviews_used < 2 && plan.window_open && (
              <p className="jsp-note">Your second review unlocks once the first is delivered.</p>
            )}
            {error && <p className="jsp-error">{error}</p>}
          </div>
        </>
      )}
    </div>
  )
}
