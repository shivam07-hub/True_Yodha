"use client"

import { signupEvents } from "@/lib/analytics"
import "./auth-shared.css"

interface Props {
  /** Where this disclosure lives — modal_signup or step_cv. */
  surface: string
  /** Toggle copy for CV-segment variant — discloses PDF contents. */
  variant?: "auth" | "cv"
}

export function LinkedInDisclosure({ surface, variant = "auth" }: Props) {
  if (variant === "cv") {
    return (
      <details
        className="tm-auth-disclosure"
        onToggle={(e) => {
          if ((e.currentTarget as HTMLDetailsElement).open) {
            signupEvents.linkedinDisclosureExpanded({ surface })
          }
        }}
      >
        <summary>What gets read from the PDF?</summary>
        <div className="tm-auth-disclosure-body">
          <dl>
            <dt>We read</dt>
            <dd>roles, dates, skills, education, summary.</dd>
            <dt>We grant</dt>
            <dd>+50 XP for linking your LinkedIn profile, one time.</dd>
            <dt>We don&apos;t</dt>
            <dd>post on your behalf, message connections, or scrape your network.</dd>
          </dl>
        </div>
      </details>
    )
  }

  return (
    <details
      className="tm-auth-disclosure"
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open) {
          signupEvents.linkedinDisclosureExpanded({ surface })
        }
      }}
    >
      <summary>What does LinkedIn share with Myro?</summary>
      <div className="tm-auth-disclosure-body">
        <dl>
          <dt>We read</dt>
          <dd>name, email, profile picture, LinkedIn vanity URL, headline, verification status.</dd>
          <dt>We grant</dt>
          <dd>+50 XP for connecting LinkedIn — one time only.</dd>
          <dt>We don&apos;t</dt>
          <dd>
            post on your behalf, message connections, scrape your network, or read your work history.
            You&apos;ll explicitly tap &ldquo;Share to LinkedIn&rdquo; inside Myro for anything to leave.
          </dd>
        </dl>
      </div>
    </details>
  )
}
