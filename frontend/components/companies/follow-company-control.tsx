"use client"

import { Loader2 } from "lucide-react"
import type { FollowCompanyAction } from "@/lib/hooks/use-follow-company"
import "./company-signal.css"

interface Props {
  company: string
  action: FollowCompanyAction
  /** Story and drawer adapters show the state label; dense rails remain star-first. */
  showLabel?: boolean
  className?: string
}

/** The one visual adapter for an explicit Followed Company decision. */
export function FollowCompanyControl({ company, action, showLabel = false, className }: Props) {
  const label = action.pending
    ? action.following ? "Unfollowing…" : "Following…"
    : action.following ? "Following" : "Follow"
  const title = action.disabledReason ?? `${label} ${company}`

  return (
    <span className={`fc-control${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        className={`fc-star${action.following ? " is-on" : ""}`}
        onClick={action.toggle}
        disabled={action.disabled}
        aria-label={`${label} ${company}`}
        aria-pressed={action.following}
        title={title}
      >
        {action.pending || action.loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : action.following ? "★" : "☆"}
        {showLabel ? <span>{label}</span> : null}
      </button>
      {action.error ? <span className="fc-message" role="alert">{action.error}</span> : null}
      {!action.error && action.disabledReason && !action.following ? <span className="fc-message">{action.disabledReason}</span> : null}
    </span>
  )
}
