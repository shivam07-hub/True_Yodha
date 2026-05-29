"use client"

import * as React from "react"
import { Icon } from "./icons"

/** Locked share copy — sent with the job's careers link via the Web Share sheet. */
const JOB_SHARE_TEXT =
  "Hey, found this job on Himyro career portal, where all the company career pages are tracked and shared according to your resume"

/** Careers link mirrors the ApplyRow heuristic — Google search "{company} careers". */
function careersUrl(company: string | null | undefined): string | null {
  return company
    ? `https://www.google.com/search?q=${encodeURIComponent(`${company} careers`)}`
    : null
}

/**
 * Share affordance on the corner of an opened job card. Web Share API on
 * mobile / Safari → native sheet (WhatsApp first on India mobile); elsewhere →
 * clipboard with a transient ✓.
 */
export function JobShareButton({ company }: { company: string | null | undefined }) {
  const [copied, setCopied] = React.useState(false)
  const url = careersUrl(company)
  if (!url) return null

  const onClick = async () => {
    const title = company ? `${company} role on Myro` : "A role on Myro"
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text: JOB_SHARE_TEXT, url })
        return
      } catch {
        // cancelled / unsupported — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(`${JOB_SHARE_TEXT}\n${url}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      window.prompt("Copy this link:", url)
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
