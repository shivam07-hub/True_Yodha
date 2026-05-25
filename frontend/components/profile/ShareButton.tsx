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
    <div style={{ position: "relative", display: "inline-flex" }}>
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
          borderColor: copied ? "var(--tm-accent)" : "var(--tm-border)",
          cursor: "pointer",
          fontSize: 16,
          transition: "color 200ms, border-color 200ms",
        }}
      >
        {copied ? "✓" : "↗"}
      </button>
      {copied && (
        <span
          role="status"
          aria-live="polite"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            padding: "5px 10px",
            background: "var(--tm-surface)",
            border: "1px solid var(--tm-accent)",
            color: "var(--tm-accent)",
            borderRadius: 99,
            fontSize: 11,
            fontFamily: "var(--tm-font-mono)",
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
            boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
            zIndex: 50,
            pointerEvents: "none",
          }}
        >
          Link copied
        </span>
      )}
    </div>
  )
}
