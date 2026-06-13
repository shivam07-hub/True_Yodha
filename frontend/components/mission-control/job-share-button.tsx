"use client"

import * as React from "react"
import { Icon } from "./icons"
import { careersUrl, shareJob } from "@/lib/job-share"

/**
 * Share affordance on the corner of an opened job card. Web Share API on
 * mobile / Safari → native sheet (WhatsApp first on India mobile); elsewhere →
 * clipboard with a transient ✓.
 */
export function JobShareButton({ company }: { company: string | null | undefined }) {
  const [copied, setCopied] = React.useState(false)
  if (!careersUrl(company)) return null

  const onClick = async () => {
    if ((await shareJob(company)) === "copied") {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="mc-focus-share tm-control-focus"
      aria-label={copied ? "Link copied" : "Share this job"}
      title="Share this job"
    >
      {copied ? <Icon name="check" size={13} stroke={2.2} /> : <Icon name="ext" size={13} />}
    </button>
  )
}
