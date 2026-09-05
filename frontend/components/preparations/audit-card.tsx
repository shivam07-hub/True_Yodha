"use client"

/**
 * AI Workflow Audit — the offer and its state, in the Prep standing column.
 *
 * The service is a call about an AI workflow the buyer actually runs. This card
 * is the entry point only: the intake and the delivered audit live at
 * /preparations/audit, because six questions do not belong in a rail.
 *
 * Capacity is stated, not implied. `slots_open` is real remaining reviewer
 * capacity, so when it hits zero the card stops offering rather than taking a
 * booking nobody can honour. That is the opposite of a scarcity device — it is
 * the reason the promise can be kept.
 */

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight } from "lucide-react"
import { workflowAudit, type WorkflowAudit } from "@/lib/api"
import { formatDate } from "@/lib/format"
import "./audit-card.css"

const PRICE = "₹999"

/** What the card says, per state. One line each: the rail is not a brochure. */
function statusLine(audit: WorkflowAudit): { label: string; detail: string; cta: string } {
  switch (audit.status) {
    case "awaiting_submission":
      return {
        label: "Tell us what you run",
        detail: "Six questions. The call is booked from your answers.",
        cta: "Start",
      }
    case "submitted":
    case "in_progress":
      return {
        label: "Booked",
        detail: audit.sla_due_at
          ? `We come back to you by ${formatDate(audit.sla_due_at, "medium")}.`
          : "We are lining up your call.",
        cta: "View",
      }
    case "delivered":
      return {
        label: "Your audit",
        detail: audit.reviewed_by ? `Reviewed by ${audit.reviewed_by}.` : "Ready to read.",
        cta: "Read",
      }
  }
}

export function AuditCard({ token }: { token: string }) {
  const mineQ = useQuery({
    queryKey: ["workflow-audit", "mine"],
    queryFn: () => workflowAudit.mine(token),
    enabled: !!token,
    staleTime: 60 * 1000,
  })
  const availQ = useQuery({
    queryKey: ["workflow-audit", "availability"],
    queryFn: () => workflowAudit.availability(),
    staleTime: 5 * 60 * 1000,
  })

  const audit = mineQ.data?.audit ?? null
  const avail = availQ.data

  // Nothing bought, no capacity: say so plainly rather than showing a control
  // that cannot work. An offer that fails on click is worse than no offer.
  if (!audit && avail && !avail.available) {
    return (
      <section className="prp-stand awd" aria-labelledby="awd-title">
        <h3 id="awd-title" className="awd-title">AI Workflow Audit</h3>
        <p className="awd-line">
          Every slot is taken this week. The next one opens when a call is done.
        </p>
      </section>
    )
  }

  if (!audit) {
    // Still loading availability: render the offer without the slot count
    // rather than flashing a number that may be wrong.
    return (
      <section className="prp-stand awd" aria-labelledby="awd-title">
        <h3 id="awd-title" className="awd-title">AI Workflow Audit</h3>
        <p className="awd-line">
          A call about an AI workflow you actually run. What it touches, who
          checks it, what happens when it is wrong.
        </p>
        <div className="awd-foot">
          <span className="awd-price">{PRICE}</span>
          {avail ? (
            <span className="awd-slots">{avail.slots_open} of 5 open</span>
          ) : null}
        </div>
        <Link className="awd-go tm-control-focus" href="/preparations/audit">
          See what it covers <ArrowRight size={13} aria-hidden />
        </Link>
      </section>
    )
  }

  const line = statusLine(audit)
  return (
    <section className="prp-stand awd" aria-labelledby="awd-title">
      <h3 id="awd-title" className="awd-title">AI Workflow Audit</h3>
      <p className="awd-state">{line.label}</p>
      <p className="awd-line">{line.detail}</p>
      <Link className="awd-go tm-control-focus" href="/preparations/audit">
        {line.cta} <ArrowRight size={13} aria-hidden />
      </Link>
    </section>
  )
}
