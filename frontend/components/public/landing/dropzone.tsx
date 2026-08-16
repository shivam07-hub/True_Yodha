"use client"

import { useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { stashAnonCvFile, stashAnonCvText } from "@/lib/anon-cv-stash"

/**
 * The live CV dropzone (grill: pre-login real score). The landing CV Hub
 * mounts the `stage` variant; `/cv-preview` can pass `onFile`/`onText` to
 * score in place instead of navigating.
 *
 * Navigate-then-load (grill 2026-06-19): the dropzone does NOT score here. It
 * stashes the File and jumps to /cv-preview, which scores it and either opens
 * the playground (structured CV) or routes to /signup with the score readout
 * (degraded parse). One destination owns the loading + the fork.
 *
 * Paste-text (#4, Vaibhav email): a first-class alternative beside the drop —
 * a small text POST that dodges the multipart-upload failures some networks and
 * regions hit. Same navigate-then-load fork; text stash instead of a File.
 */
const ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"

interface LandingDropzoneProps {
  source: string
  /** When set, the parent owns scoring (the /cv-preview direct-hit case). When
   *  omitted, the dropzone stashes the file/text and navigates to /cv-preview. */
  onFile?: (file: File) => void
  onText?: (text: string) => void
  busy?: boolean
  /** `stage` is the CV Hub drop — tall, centered, same copy as /cv-preview. */
  variant?: "bar" | "stage"
  children?: ReactNode
}

export function LandingDropzone({
  source,
  onFile,
  onText,
  busy,
  variant = "bar",
  children,
}: LandingDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [navigating, setNavigating] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [text, setText] = useState("")
  const pending = busy || navigating

  function handleFile(file: File) {
    if (pending) return
    if (onFile) return onFile(file)
    // Landing path: hold the file, jump to the scorer.
    setNavigating(true)
    stashAnonCvFile(file)
    router.push("/cv-preview")
  }

  function handleText() {
    const value = text.trim()
    if (pending || value.length < 40) return
    if (onText) return onText(value)
    setNavigating(true)
    stashAnonCvText(value)
    router.push("/cv-preview")
  }

  const stage = variant === "stage"
  const title = pending
    ? "Reading your CV…"
    : stage
      ? "Drop your CV here, or choose a file"
      : "Upload CV — PDF or DOCX"
  const hint = pending
    ? "This takes a few seconds."
    : stage
      ? "PDF or DOCX, up to 10 MB"
      : "Private · saved only if you create an account"

  return (
    <div className="lp-dz-wrap" data-variant={variant}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = "" // allow re-selecting the same file
        }}
        data-source={source}
      />
      <button
        type="button"
        className={`lp-dropzone${navigating ? " is-dragging" : ""}`}
        aria-label="Drop your CV to see your Myro Score"
        aria-busy={pending}
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
        }}
        onDrop={(e) => {
          e.preventDefault()
          const file = e.dataTransfer.files?.[0]
          if (file) handleFile(file)
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
          <span className="lp-dropzone-title">{title}</span>
          <span className="lp-dropzone-trust">{hint}</span>
        </span>
        {!stage && (
          <span className="lp-dropzone-btn" aria-hidden>
            {pending ? "Scoring…" : "Choose file"}
          </span>
        )}
      </button>

      {pasteOpen ? (
        <div className="lp-paste">
          <textarea
            className="lp-paste-area"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your CV text here — experience, skills, education…"
            rows={6}
            aria-label="Paste your CV text"
            disabled={pending}
            autoFocus
          />
          <div className="lp-paste-actions">
            <button
              type="button"
              className="lp-paste-score"
              onClick={handleText}
              disabled={pending || text.trim().length < 40}
            >
              {pending ? "Scoring…" : "Score my text"}
            </button>
            <button type="button" className="lp-paste-cancel" onClick={() => setPasteOpen(false)} disabled={pending}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className={stage ? "lp-dz-alts" : undefined}>
          <button
            type="button"
            className={stage ? "lp-dz-alt" : "lp-dropzone-paste-toggle"}
            onClick={() => setPasteOpen(true)}
            disabled={pending}
          >
            {stage ? "No CV? Paste your CV text" : "Upload not working? Paste your CV text instead"}
          </button>
          {children}
        </div>
      )}
      {stage && (
        <p className="lp-dropzone-note">Your CV is saved only if you choose to create an account.</p>
      )}
    </div>
  )
}
