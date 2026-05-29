"use client"

import { signupEvents } from "@/lib/analytics"
import "./auth-shared.css"

interface Props {
  /** Where this disclosure lives — e.g. step_cv. */
  surface: string
}

/**
 * Discloses what Myro reads from a LinkedIn "Save to PDF" upload, shown in the
 * LinkedIn segment of StepCV. The auth-surface variant ("What LinkedIn shows
 * us") was retired in favour of a single privacy link on the auth forms —
 * that content now lives on /privacy (§02-C).
 */
export function LinkedInDisclosure({ surface }: Props) {
  const handleToggle = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (e.currentTarget.open) {
      signupEvents.linkedinDisclosureExpanded({ surface })
    }
  }

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
