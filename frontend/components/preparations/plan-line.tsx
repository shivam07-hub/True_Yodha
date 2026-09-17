"use client"

/**
 * The last consumer CTA, offered at the moment it means something: beside the
 * CV they actually sent. One line. Not a card.
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

  if (planQ.isLoading) return null

  const plan = planQ.data

  if (!plan) {
    return (
      <span className="prp-plan">
        <Link className="tm-link" href="/job-switch-plan">
          Keep a person on this scene
        </Link>
        <span className="prp-plan-price">₹199 / month</span>
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
