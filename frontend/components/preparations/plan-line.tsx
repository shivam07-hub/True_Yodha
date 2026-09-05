"use client"

/**
 * The Job-Switch Plan, offered at the moment it means something.
 *
 * The plan has existed and sold nothing: zero purchases, and zero links to
 * /job-switch-plan anywhere in the app. It was never a demand problem. This is
 * the entry point it never had, placed beside the CV the user actually sent,
 * because "is this CV right for this job" is a question you ask right after you
 * apply and never while browsing a pricing page.
 *
 * One line, inside the record it belongs to. Not a card, not a banner, not a
 * modal: the room already carries the context, so the offer only has to name
 * the thing and the price.
 */

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { jobSwitchPlan } from "@/lib/api"

export function PlanLine({ token }: { token: string }) {
  const planQ = useQuery({
    queryKey: ["job-switch-plan"],
    queryFn: () => jobSwitchPlan.get(token),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })

  // Silence while unknown. An offer that appears after a beat, over content the
  // user is already reading, is worse than one that arrives with the section.
  if (planQ.isLoading) return null

  const plan = planQ.data

  if (!plan) {
    return (
      <span className="prp-plan">
        <Link className="tm-link" href="/job-switch-plan">
          Have this CV read against the job
        </Link>
        <span className="prp-plan-price">₹99</span>
      </span>
    )
  }

  const pending = plan.reviews?.find((r) => r.status !== "delivered")
  return (
    <span className="prp-plan">
      <Link className="tm-link" href="/job-switch-plan">
        {pending ? "Your review is on the way" : "Your plan"}
      </Link>
    </span>
  )
}
