"use client"

import { useRef, useState } from "react"
import { publicCv, type AnonScoreResponse } from "@/lib/api"
import { stashAnonCv } from "@/lib/anon-cv-stash"

/**
 * The live CV dropzone (grill: pre-login real score). Appears in the hero (S1)
 * and closing CTA (S6). A logged-out user drops a CV and gets their REAL Myro
 * Score back — the backend runs the real engine compute-only and stores nothing
 * (PV1). The file + result are stashed for claim-on-signup. Every action AFTER
 * the score (jobs, practice, save, tailor) is gated behind signup upstream.
 *
 * Turnstile: the token arg is optional. When Cloudflare Turnstile is provisioned
 * a widget should feed its token in here; until then the backend skips
 * verification (per-IP rate limit still applies) so this works in dev.
 */
const ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"

interface LandingDropzoneProps {
  source: string
  onScoring?: () => void
  onResult?: (result: AnonScoreResponse, file: File) => void
  onError?: (message: string) => void
  busy?: boolean
}

export function LandingDropzone({ source, onScoring, onResult, onError, busy }: LandingDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  async function handleFile(file: File) {
    if (busy) return
    onScoring?.()
    try {
      const result = await publicCv.scorePreview(file)
      stashAnonCv(file, result)
      onResult?.(result, file)
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Something went wrong reading that CV.")
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
          e.target.value = "" // allow re-selecting the same file
        }}
        data-source={source}
      />
      <button
        type="button"
        className={`lp-dropzone${dragging ? " is-dragging" : ""}`}
        aria-label="Drop your CV to see your Myro Score"
        aria-busy={busy}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          if (!busy) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files?.[0]
          if (file) void handleFile(file)
        }}
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
          <span className="lp-dropzone-title">
            {busy ? "Reading your CV…" : "Drop your CV — PDF or DOCX"}
          </span>
          <span className="lp-dropzone-trust">
            <span>Private</span>
            <span className="aes">processed in memory, never stored</span>
          </span>
        </span>
        <span className="lp-dropzone-btn" aria-hidden>
          {busy ? "Scoring…" : "Choose file"}
        </span>
      </button>
      <p className="lp-dropzone-note">Free · no signup to see your score</p>
    </>
  )
}
