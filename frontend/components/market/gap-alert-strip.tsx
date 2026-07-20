"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import type { GapAlert } from "@/lib/hooks/use-gap-alert"
import "./gap-alert-strip.css"

/**
 * The /intel gap-alert strip (Signal Thread 1a Zone 3). Renders only when a
 * followed company posted new roles this week for the user's closest-to-next-
 * level skill — otherwise nothing (design-over-words). Every number is real
 * (new_roles this week from the gap-signal endpoint); the copy states the fact,
 * then points to the two next moves: see the roles, or practice the skill.
 */
export function GapAlertStrip({ alert }: { alert: GapAlert | null }) {
  if (!alert) return null
  const skillParam = encodeURIComponent(alert.skill)
  return (
    <div className="gap-alert" role="status">
      <span className="gap-alert-dot" aria-hidden />
      <p className="gap-alert-copy">
        <strong>
          {alert.company} posted {alert.newRoles} new {alert.skill} role{alert.newRoles === 1 ? "" : "s"} this week
        </strong>{" "}
        <span className="gap-alert-sub">— the skill closest to your next level.</span>
      </p>
      <div className="gap-alert-actions">
        <Link href={`/market?skill=${skillParam}`} className="gap-alert-link">See the roles</Link>
        <Link href={`/forge?skill=${skillParam}`} className="gap-alert-cta">
          Practice {alert.skill} <ArrowRight size={14} aria-hidden />
        </Link>
      </div>
    </div>
  )
}
