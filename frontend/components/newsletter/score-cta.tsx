"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { getAccessToken } from "@/lib/session"

/**
 * Auth-aware newsletter score CTA. The newsletter is a public acquisition
 * surface, but a logged-in reader already has a CV + a live score — sending
 * them through the anonymous `/cv-preview` scorer (or worse, a login wall)
 * is a dead end. Same `getAccessToken()` seam the public nav + docs page use:
 * authed → straight to their score at /skills, anon → the free scorer.
 */
export function ScoreCta({
  campaign,
  linkClassName,
  bodyClassName,
}: {
  campaign: string
  linkClassName: string
  bodyClassName: string
}) {
  const [isAuthed, setIsAuthed] = useState(false)
  useEffect(() => {
    setIsAuthed(!!getAccessToken())
  }, [])

  if (isAuthed) {
    return (
      <>
        <p className={bodyClassName}>Your score is live against this same hiring data.</p>
        <Link href="/skills" className={linkClassName}>
          See my Myro Score &rarr;
        </Link>
      </>
    )
  }

  return (
    <>
      <p className={bodyClassName}>
        Drop your CV against this same live hiring data. Free, no account needed.
      </p>
      <Link
        href={`/cv-preview?utm_source=newsletter&utm_campaign=${encodeURIComponent(campaign)}`}
        className={linkClassName}
      >
        Get my free Myro Score &rarr;
      </Link>
    </>
  )
}
