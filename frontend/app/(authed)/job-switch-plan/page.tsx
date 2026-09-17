"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Compass, ArrowRight, CheckCircle2 } from "lucide-react"
import { jobSwitchPlan, type JobSwitchPlan } from "@/lib/api"
import { captureAttribution } from "@/lib/attribution"
import { startEngagementCheckout } from "@/lib/engagement-checkout"
import { getAccessToken } from "@/lib/session"
import { formatDate } from "@/lib/format"
import "./job-switch-plan.css"

const POINTS = [
  "This job, this CV, this skill path. One scene, kept staffed.",
  "A named reviewer makes one human pass each billing month.",
  "Guidance is ours. Getting the job is yours. Cancel when you convert.",
]

type PayStatus = "idle" | "starting" | "verifying"

function isLinkedInDoor(params: URLSearchParams) {
  return params.get("from") === "linkedin_services" || params.get("utm_source") === "linkedin_services"
}

function JobSwitchPlanPage() {
  const router = useRouter()
  const params = useSearchParams()
  const linkedInDoor = isLinkedInDoor(params)
  const [plan, setPlan] = useState<JobSwitchPlan | null | undefined>(undefined)
  const [payStatus, setPayStatus] = useState<PayStatus>("idle")
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const token = getAccessToken()
    if (!token) {
      if (linkedInDoor) {
        setPlan(null)
        return
      }
      router.push("/login")
      return
    }
    try {
      setPlan(await jobSwitchPlan.get(token))
    } catch {
      setError("Couldn't load your scene. Refresh to retry.")
      setPlan(null)
    }
  }, [router, linkedInDoor])

  useEffect(() => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href)
      if (linkedInDoor && !url.searchParams.get("utm_source")) {
        url.searchParams.set("utm_source", "linkedin_services")
      }
      captureAttribution(url.toString())
    }
    void load()
  }, [load, linkedInDoor])

  const startCheckout = useCallback(() => {
    setError(null)
    const token = getAccessToken()
    if (!token) {
      router.push(linkedInDoor ? "/signup?utm_source=linkedin_services" : "/login")
      return
    }
    const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
    if (!key) {
      setError("Checkout isn't available right now. Please try again shortly.")
      return
    }
    setPayStatus("starting")
    void startEngagementCheckout({
      token,
      key,
      onVerifying: () => setPayStatus("verifying"),
      onDismiss: () => setPayStatus("idle"),
      onFailed: (message) => {
        setPayStatus("idle")
        setError(message)
      },
    }).then(async (result) => {
      if (result === "active") {
        setPayStatus("idle")
        await load()
        return
      }
      if (result === "dismissed") setPayStatus("idle")
    })
  }, [router, load, linkedInDoor])

  const requestSecond = useCallback(async () => {
    const token = getAccessToken()
    if (!token) return
    setRequesting(true)
    setError(null)
    try {
      await jobSwitchPlan.requestReview(token)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't request the pass.")
    } finally {
      setRequesting(false)
    }
  }, [load])

  const live = plan?.window_open !== false
  const pending = plan?.reviews.find((r) => r.status !== "delivered")

  return (
    <div className="jsp-wrap">
      <span className="jsp-kicker">Personalised Engagement</span>

      {plan === undefined && <div className="jsp-skeleton" style={{ marginTop: 24 }} />}

      {plan === null && (
        <>
          <h1 className="jsp-title">Keep a person on this scene.</h1>
          <p className="jsp-sub">
            {linkedInDoor
              ? "Month 1 is the resume you asked for, written against the job you name, delivered here."
              : "A reviewer reads this CV against this job each month. We make you switch-ready. We do not place you."}
          </p>
          <div className="jsp-card">
            <ul className="jsp-points">
              {POINTS.map((p) => <li key={p}>{p}</li>)}
            </ul>
            <div className="jsp-offer-foot">
              <span className="jsp-price">
                <strong>₹199</strong> <span className="jsp-price-note">/ month</span>
              </span>
              <button className="jsp-btn" onClick={startCheckout} disabled={payStatus !== "idle"}>
                {payStatus === "starting" ? "Opening checkout…" : payStatus === "verifying" ? "Confirming…" : "Staff this scene"}
                <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
              </button>
            </div>
            {error && <p className="jsp-error">{error}</p>}
          </div>
        </>
      )}

      {plan && (
        <>
          <h1 className="jsp-title">{live ? "Your scene." : "This scene is no longer staffed."}</h1>
          <div className="jsp-card">
            <div className="jsp-meta-row">
              <div className="jsp-meta">
                <span className="jsp-meta-k">Target role</span>
                <span className="jsp-meta-v">{plan.target_role || "Set in your job feed"}</span>
              </div>
              <div className="jsp-meta">
                <span className="jsp-meta-k">Passes delivered</span>
                <span className="jsp-meta-v">{plan.reviews_used}</span>
              </div>
              <div className="jsp-meta">
                <span className="jsp-meta-k">This month</span>
                <span className="jsp-meta-v">
                  {live ? `staffed until ${formatDate(plan.window_expires_at)}` : "cancelled"}
                </span>
              </div>
            </div>
          </div>

          <div className="jsp-card">
            <div className="jsp-reviews">
              {plan.reviews.length === 0 && (
                <p className="jsp-note">This month&apos;s pass is being prepared.</p>
              )}
              {plan.reviews.map((r) => (
                <div className="jsp-review" key={r.id}>
                  <div className="jsp-review-head">
                    <span className="jsp-review-no">
                      {r.status === "delivered" && <CheckCircle2 size={15} strokeWidth={2} aria-hidden style={{ verticalAlign: "-2px", marginRight: 6 }} />}
                      Pass {r.review_no}
                    </span>
                    <span className="jsp-pill" data-status={r.status}>
                      {r.status === "in_progress" ? "in progress" : r.status}
                    </span>
                  </div>
                  {r.status === "delivered" && r.review_text ? (
                    <p className="jsp-review-text">{r.review_text}</p>
                  ) : (
                    <p className="jsp-review-sla">A Myro reviewer will respond by {formatDate(r.sla_due_at)}.</p>
                  )}
                </div>
              ))}
            </div>

            <div className="jsp-actions">
              {live && (
                <button
                  className="jsp-btn"
                  onClick={requestSecond}
                  disabled={!plan.can_request_second_review || requesting}
                >
                  {requesting ? "Requesting…" : pending ? "Pass in progress" : "Request this month's pass"}
                </button>
              )}
              <Link className="jsp-btn jsp-btn-ghost" href="/practice">
                <Compass size={16} strokeWidth={1.5} aria-hidden />
                Work the path
              </Link>
            </div>
            {error && <p className="jsp-error">{error}</p>}
          </div>
        </>
      )}
    </div>
  )
}

export default function JobSwitchPlanRoute() {
  return (
    <Suspense fallback={<div className="jsp-wrap"><div className="jsp-skeleton" style={{ marginTop: 24 }} /></div>}>
      <JobSwitchPlanPage />
    </Suspense>
  )
}
