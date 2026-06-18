"use client"

import Link from "next/link"
import { trackEvent } from "@/lib/analytics"

interface NewsletterCTAProps {
  role: string
  issueSlug: string
}

export function NewsletterCTA({ role, issueSlug }: NewsletterCTAProps) {
  const href = `/signup?role=${encodeURIComponent(role)}&utm_source=newsletter&utm_campaign=${encodeURIComponent(issueSlug)}`

  return (
    <div className="nl-fig nl-callout" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="nl-eyebrow nl-eyebrow--accent">Powered by Myro Coins</div>
      <div className="nl-callout-title">See how you compare as a {role}</div>
      <p className="nl-callout-body" style={{ margin: 0 }}>
        Upload your CV and get your Myro Score in 60 seconds. See exactly which skills from this market data you already have.
      </p>
      <Link
        href={href}
        onClick={() => trackEvent("newsletter_cta_click", { role, issue_slug: issueSlug })}
        className="nl-pill"
      >
        Get my free Myro Score →
      </Link>
    </div>
  )
}
