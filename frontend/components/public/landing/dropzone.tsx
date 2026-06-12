"use client"

import { useSignupGate } from "@/lib/hooks/use-signup-gate"

/**
 * The kept CV-dropzone CTA (dark terminal skin). Appears twice — hero (S1)
 * and closing CTA (S6). Both instances route through the canonical signup
 * gate with the upload intent preserved (handoff §Interactions).
 */
export function LandingDropzone({ source }: { source: string }) {
  const signup = useSignupGate()

  return (
    <>
      <button
        type="button"
        className="lp-dropzone"
        aria-label="Drop your CV to get started — sign up required"
        onClick={() => signup.open({ surface: "about_hero", next: "/cv?upload=1", source })}
      >
        <span className="lp-dropzone-icon" aria-hidden>
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3v14M6 9l6-6 6 6M5 21h14" />
          </svg>
        </span>
        <span className="lp-dropzone-body">
          <span className="lp-dropzone-title">Drop your CV — PDF or DOCX</span>
          <span className="lp-dropzone-trust">
            <span>Private</span>
            <span className="aes">AES-256 at rest</span>
          </span>
        </span>
        <span className="lp-dropzone-btn" aria-hidden>
          Choose file
        </span>
      </button>
      <p className="lp-dropzone-note">Free to start · No credit card</p>
    </>
  )
}
