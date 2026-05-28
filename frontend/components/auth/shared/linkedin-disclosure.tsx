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
  const handleToggle = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (e.currentTarget.open) {
      signupEvents.linkedinDisclosureExpanded({ surface })
    }
  }

  if (variant === "cv") {
    return (
      <details className="tm-auth-disclosure" onToggle={handleToggle}>
        <summary>What we read from your PDF</summary>
        <div className="tm-auth-disclosure-body">
          <p>
            Roles, dates, skills, education, and the summary you&apos;ve already written —
            the same handful of things a recruiter scans in thirty seconds.
          </p>
          <p className="tm-auth-disclosure-never">
            <span className="tm-auth-disclosure-never-tag">Never</span>
            Your PDF stays in your hub. Tailored versions are yours to download, share, or delete.
            Nothing auto-sent. Nothing stored where you can&apos;t see it.
          </p>
        </div>
      </details>
    )
  }

  return (
    <details className="tm-auth-disclosure" onToggle={handleToggle}>
      <summary>What LinkedIn shows us</summary>
      <div className="tm-auth-disclosure-body">
        <p>
          Your name, email, profile picture, and the headline you&apos;ve already made public on LinkedIn.
          Nothing private. Nothing you haven&apos;t already published.
        </p>
        <p className="tm-auth-disclosure-never">
          <span className="tm-auth-disclosure-never-tag">Never</span>
          We don&apos;t post for you, message your network, or read who you&apos;re connected to.
          If something needs to leave Myro, you tap a button to send it.
        </p>
      </div>
    </details>
  )
}
