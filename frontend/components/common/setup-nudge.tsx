"use client"

import "./setup-nudge.css"

interface SetupNudgeProps {
  /** False until the profile fetch has resolved — never nudge on a guess. */
  resolved: boolean
  hasCv: boolean
  hasTargetRoles: boolean
  className?: string
  style?: React.CSSProperties
}

/**
 * The one re-entry into the spine: CV → score → target → feed.
 *
 * ONE DESTINATION, deliberately. `/cv` is the workstation — it takes an upload,
 * scores it, and stops. It has never asked for a target role, so a first upload
 * made there leaves the user without the thing that triples apply rate (26% with
 * a target, 9% without). `/onboarding` is the only surface that carries a user
 * from no-CV all the way to the feed, and it self-resolves to /market for anyone
 * who does not need it. So every "you have not started yet" call-to-action in the
 * product points here, and nowhere else.
 *
 * GATED ON WHAT IS MISSING, never on `onboarding_complete`. 111 users carry that
 * flag with no target role — a leaky gate between 2026-04-20 and 2026-06-20 let
 * them through, and afterwards nothing could reach them, because they were
 * "complete". A flag is not the fact.
 *
 * This replaces two components that said the same thing differently: desktop
 * /market rendered an inline `.mi-nudge` pointing at /onboarding, mobile /market
 * rendered `CVRequiredNudge` pointing at /cv. Mobile also had no nudge at all for
 * the has-CV-no-target state, so 234 users were unreachable on the viewport most
 * of them use.
 */
export function SetupNudge({ resolved, hasCv, hasTargetRoles, className, style }: SetupNudgeProps) {
  if (!resolved) return null
  if (hasCv && hasTargetRoles) return null

  const copy = hasCv
    ? { head: "Pick a target role", sub: "Myro puts your best-fit jobs first.", cta: "Pick a role" }
    : { head: "Upload your CV", sub: "Myro scores it and ranks jobs by your fit.", cta: "Upload CV" }

  return (
    <div className={className ? `tm-setup-nudge ${className}` : "tm-setup-nudge"} style={style}>
      <div className="tm-setup-nudge-t">
        <b>{copy.head}</b>
        <span>{copy.sub}</span>
      </div>
      <a href="/onboarding" className="tm-setup-nudge-go">{copy.cta}</a>
    </div>
  )
}
