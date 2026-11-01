"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { trackEvent } from "@/lib/analytics"
import { getAccessToken } from "@/lib/session"

interface IssueCtaProps {
  /** utm_campaign for this issue, e.g. "issue-025". */
  campaign: string
  issueSlug: string
  children?: ReactNode
}

/**
 * The one call to action on an issue, and the only place an issue says what
 * Myro does. The template renders it, so issue bodies carry no CTA of their
 * own. A first signup lands on /onboarding, the front door into the loop;
 * a signed-in reader already has a CV, so they go straight to their jobs.
 */
export function IssueCta({ campaign, issueSlug, children }: IssueCtaProps) {
  const [isAuthed, setIsAuthed] = useState(false)
  useEffect(() => {
    setIsAuthed(!!getAccessToken())
  }, [])

  const href = isAuthed
    ? "/market"
    : `/signup?utm_source=newsletter&utm_medium=article&utm_campaign=${encodeURIComponent(campaign)}`

  return (
    <section
      aria-labelledby="issue-cta-heading"
      className="nl-callout"
      style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12, marginTop: 56 }}
    >
      <h2 id="issue-cta-heading" className="nl-callout-title" style={{ margin: 0 }}>
        Tailor your CV to jobs like these
      </h2>
      <p className="nl-callout-body" style={{ margin: 0 }}>
        At Myro we track all the official career pages of MNCs and actually track what skills they
        are hiring for. We read what companies ask for, in which city, and combine that knowledge
        to build a repository of skills required for each company. Pick the job you want, and Myro
        tailors your CV to it. You apply on the company&rsquo;s own page.
      </p>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 4 }}>
        <Link
          href={href}
          onClick={() => trackEvent("newsletter_cta_click", { issue_slug: issueSlug })}
          className="nl-pill"
        >
          Tailor my CV →
        </Link>
        {children}
      </div>
    </section>
  )
}
