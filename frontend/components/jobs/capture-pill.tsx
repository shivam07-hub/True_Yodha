"use client"

import * as React from "react"
import "./capture-pill.css"

/**
 * The ONE capture control — every surface that can save a job renders this, never
 * a hand-rolled ★ button (market TriageButtons, Collections, Intel rows, company
 * rows, the extension, and "Add a job" all read from here). Unifying the control
 * is half the Delta-4 job; the other half is the *confirmation* — on full feed
 * cards that is <CaptureConfirm> (the in-card morph band); on compact rows the
 * pill's own `saved` state carries the inline "Tailor →" next-step, so the row
 * answers "where did it go" without a band.
 *
 * Presentational + headless: `status` and the callbacks live in the owning
 * surface (market drains; Collections persists; public rows gate anon → signup).
 * That keeps the pill a single source both consumers read.
 *
 *   rest        →  ★ Save                        (accent outline + wash, fills on hover)
 *   saved       →  ✓ In Collections · Tailor →   (success tone; inline next step)
 *   signed-out  →  ★ Save → sign up              (SEO pages, anon → funnel)
 */
export type CaptureStatus = "rest" | "saved" | "signed-out"

export interface CapturePillProps {
  status: CaptureStatus
  /** rest → save the job. */
  onSave?: () => void
  /** saved → jump to tailoring this job. Omit to hide the inline next-step. */
  onTailor?: () => void
  /** signed-out → where the anon funnel points (default /signup). Kept as a real
   *  href so it's crawlable on SEO pages + middle-click works. */
  signUpHref?: string
  /** signed-out → optional handler (e.g. open the signup-gate modal). When given,
   *  a plain click calls it (the consumer preventDefaults); the href still serves
   *  crawlers + modified clicks. */
  onSignUp?: () => void
  /** Compact rows (Intel / company pages) use "sm". */
  size?: "md" | "sm"
  /** Accessible name for the job being captured, e.g. "Decision Analyst at Barclays". */
  label?: string
  className?: string
}

export function CapturePill({
  status,
  onSave,
  onTailor,
  signUpHref = "/signup",
  onSignUp,
  size = "md",
  label,
  className = "",
}: CapturePillProps) {
  const cls = `tm-capture tm-capture-${size} ${className}`.trim()

  if (status === "saved") {
    // Status, not a button — the flip itself is the confirmation. The actionable
    // affordance is the inline next-step. aria-live announces the save for SR.
    return (
      <span className={`${cls} is-saved`}>
        <span className="tm-capture-state" role="status" aria-live="polite">
          <Check aria-hidden /> In Collections
        </span>
        {onTailor ? (
          <button
            type="button"
            className="tm-capture-next"
            onClick={(e) => {
              e.stopPropagation()
              onTailor()
            }}
          >
            Tailor <span aria-hidden>→</span>
          </button>
        ) : null}
      </span>
    )
  }

  if (status === "signed-out") {
    return (
      <a
        href={signUpHref}
        className={`${cls} is-signup`}
        onClick={(e) => {
          e.stopPropagation()
          // Progressive enhancement: keep the crawlable href + modified-click,
          // but a plain click opens the signup gate when the surface provides one.
          if (onSignUp && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
            e.preventDefault()
            onSignUp()
          }
        }}
        aria-label={label ? `Save ${label} — sign up to keep it` : "Save — sign up to keep it"}
      >
        <Star aria-hidden /> Save
        <span className="tm-capture-hint" aria-hidden>→ sign up</span>
      </a>
    )
  }

  return (
    <button
      type="button"
      className={`${cls} is-rest`}
      onClick={(e) => {
        e.stopPropagation()
        onSave?.()
      }}
      aria-label={label ? `Save ${label} to Collections` : "Save to Collections"}
    >
      <Star aria-hidden /> Save
    </button>
  )
}

function Star(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 18.9 6 20.7l1.3-6.6L2.5 9.4l6.6-.8L12 2.5z" />
    </svg>
  )
}

function Check(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M4 12.5l5 5L20 7" />
    </svg>
  )
}
