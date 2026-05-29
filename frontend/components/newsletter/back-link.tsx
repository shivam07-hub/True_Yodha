"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"

// "‹ Newsletter" back affordance. Uses router.back() when there's in-app history
// (restores the archive scroll position via App Router scroll restoration); falls
// back to a hard /newsletter link for direct loads / new tabs / no history.
export function NewsletterBackLink() {
  const router = useRouter()

  const hasHistory = typeof window !== "undefined" && window.history.length > 1

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // Let modified clicks (cmd/ctrl/middle) open /newsletter normally.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    if (!hasHistory) return
    e.preventDefault()
    router.back()
  }

  return (
    <Link
      href="/newsletter"
      onClick={handleClick}
      className="nl-back-link"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--tm-text-muted)", textDecoration: "none", marginBottom: 40, transition: "color var(--tm-dur) var(--tm-ease)" }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Newsletter
    </Link>
  )
}