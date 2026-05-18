"use client"

import { useState } from "react"

export interface ShareButtonProps {
  /** Absolute URL to the public profile page. */
  url: string
  /** Optional ninja_name to use in the share title; defaults to "Myro". */
  ninjaName?: string
}

/**
 * Web Share API affordance. Single icon, no modal.
 *
 * On platforms with `navigator.share` (mobile, Safari, Android Chrome) → native
 * share sheet. Elsewhere → copy URL to clipboard with a transient "Copied"
 * label.
 */
export function ShareButton({ url, ninjaName }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)
  const title = ninjaName ? `${ninjaName} on Myro` : "My Myro domain map"

  const onClick = async () => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url })
        return
      } catch {
        // user cancelled or the API rejected — fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // Last-resort: prompt the user.
      window.prompt("Copy this link:", url)
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={copied ? "Link copied" : "Share my domain map"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 36,
        height: 36,
        background: "transparent",
        border: "1px solid var(--tm-border)",
        borderRadius: 8,
        color: copied ? "var(--tm-accent)" : "var(--tm-text)",
        cursor: "pointer",
        fontSize: 16,
        transition: "color 200ms, border-color 200ms",
      }}
    >
      {copied ? "✓" : "↗"}
    </button>
  )
}
