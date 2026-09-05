"use client"

/**
 * The AI Workflow Audit room — offer, intake, and the delivered audit.
 *
 * One surface, four states, because they are the same thing at different points
 * in its life and splitting them would make the buyer hunt for where their
 * purchase went.
 *
 * The service is a CALL. Every line of copy here says so: what is bought is a
 * person's attention on a workflow the buyer actually runs, and the written
 * audit is what comes out of that conversation.
 */

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { billing, workflowAudit, type AuditIntake, type WorkflowAudit } from "@/lib/api"
import { formatDate } from "@/lib/format"
import { loadRazorpay } from "@/lib/razorpay"
import { AuditIntakeForm } from "./audit-intake-form"
import "./audit-room.css"

interface RazorpayConstructor {
  new (options: Record<string, unknown>): { open: () => void }
}

const COVERS = [
  "Where the workflow can be wrong without anyone noticing",
  "What it touches that it should not",
  "Who is accountable when it fails, and whether that person can act",
  "What to change first, and what is fine as it is",
]

export function AuditRoom({ token }: { token: string }) {
  const qc = useQueryClient()
  const [payError, setPayError] = useState<string | null>(null)

  const mineQ = useQuery({
    queryKey: ["workflow-audit", "mine"],
    queryFn: () => workflowAudit.mine(token),
    enabled: !!token,
  })
  const availQ = useQuery({
    queryKey: ["workflow-audit", "availability"],
    queryFn: () => workflowAudit.availability(),
  })

  const submitM = useMutation({
    mutationFn: (intake: AuditIntake) => workflowAudit.submit(token, intake),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflow-audit"] }),
  })

  const buy = async () => {
    setPayError(null)
    try {
      const Razorpay = await loadRazorpay<RazorpayConstructor>()
      if (!Razorpay) {
        setPayError("Payments could not load. Check your connection and try again.")
        return
      }
      const order = await billing.createOrder(token, "ai_workflow_audit")
      new Razorpay({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        order_id: order.order_id,
        name: "Myro",
        description: "AI Workflow Audit",
        handler: async (response: Record<string, string>) => {
          await billing.verifyPayment(token, {
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_signature: response.razorpay_signature,
          })
          qc.invalidateQueries({ queryKey: ["workflow-audit"] })
        },
      }).open()
    } catch {
      // A full queue answers 409 between render and click. Say the true thing
      // rather than a generic failure.
      setPayError("That slot just went. Check back when a call is done.")
      qc.invalidateQueries({ queryKey: ["workflow-audit", "availability"] })
    }
  }

  const audit = mineQ.data?.audit ?? null
  const avail = availQ.data

  if (mineQ.isLoading) {
    return <p className="awr-quiet">Loading.</p>
  }

  if (!audit) return <Offer avail={avail} onBuy={buy} error={payError} />
  if (audit.status === "awaiting_submission") {
    return (
      <AuditIntakeForm
        pending={submitM.isPending}
        error={submitM.error instanceof Error ? submitM.error.message : null}
        onSubmit={(intake) => submitM.mutate(intake)}
      />
    )
  }
  return <Booked audit={audit} />
}

function Offer({
  avail,
  onBuy,
  error,
}: {
  avail: { available: boolean; slots_open: number } | undefined
  onBuy: () => void
  error: string | null
}) {
  const soldOut = avail && !avail.available
  return (
    <section className="awr">
      <h1 className="awr-title">AI Workflow Audit</h1>
      <p className="awr-lede">
        A call about an AI workflow you actually run. You describe it, someone
        reads it properly, then we talk it through and you get that in writing.
      </p>

      <h2 className="awr-h2">What it covers</h2>
      <ul className="awr-covers">
        {COVERS.map((line) => <li key={line}>{line}</li>)}
      </ul>

      <p className="awr-note">
        Practice, quizzes and certificates on Myro stay free. What you are paying
        for here is a person&apos;s time on your workflow.
      </p>

      <div className="awr-buy">
        <span className="awr-price">₹999</span>
        {avail ? (
          <span className="awr-slots">
            {soldOut ? "No slots open" : `${avail.slots_open} of 5 open`}
          </span>
        ) : null}
      </div>

      {soldOut ? (
        <p className="awr-quiet">
          Every slot is taken. The next opens when a call is done, and this page
          will say so.
        </p>
      ) : (
        <button type="button" className="tm-btn-primary awr-cta" onClick={onBuy}>
          Book the call
        </button>
      )}
      {error ? <p className="awr-error" role="alert">{error}</p> : null}
    </section>
  )
}

function Booked({ audit }: { audit: WorkflowAudit }) {
  if (audit.status === "delivered" && audit.audit_text) {
    return (
      <section className="awr">
        <h1 className="awr-title">Your audit</h1>
        <p className="awr-meta">
          {audit.reviewed_by ? `Reviewed by ${audit.reviewed_by}` : "Reviewed"}
          {audit.signed_off_at ? ` · ${formatDate(audit.signed_off_at, "medium")}` : ""}
        </p>
        <div className="awr-doc">
          {audit.audit_text.split("\n\n").map((para, i) => <p key={i}>{para}</p>)}
        </div>
      </section>
    )
  }

  return (
    <section className="awr">
      <h1 className="awr-title">Your call is booked</h1>
      <p className="awr-lede">
        {audit.sla_due_at
          ? `We come back to you by ${formatDate(audit.sla_due_at, "medium")}, at one of the times you gave us.`
          : "We are lining up a time from the slots you gave us."}
      </p>
      {audit.intake ? (
        <>
          <h2 className="awr-h2">What you sent</h2>
          <dl className="awr-sent">
            {Object.entries(audit.intake).map(([field, value]) => (
              <div key={field}>
                <dt>{field.replace(/_/g, " ")}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
    </section>
  )
}
