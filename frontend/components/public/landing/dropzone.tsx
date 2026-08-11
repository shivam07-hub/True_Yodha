"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { stashAnonCvFile, stashAnonCvText } from "@/lib/anon-cv-stash"

/**
 * The live CV dropzone (grill: pre-login real score). Appears in the hero (S1),
 * the engine band, and the closing FAQ — anywhere a logged-out user can drop a
 * CV to get their REAL Myro Score.
 *
 * Navigate-then-load (grill 2026-06-19): the dropzone does NOT score here. It
 * stashes the File and jumps to /cv-preview, which scores it and either opens
 * the playground (structured CV) or routes to /signup with the score readout
 * (degraded parse). One destination owns the loading + the fork.
 *
 * Paste-text (#4, Vaibhav email): a first-class alternative beside the drop —
 * a small text POST that dodges the multipart-upload failures some networks and
 * regions hit. Same navigate-then-load fork; text stash instead of a File.
 *
 * On /cv-preview itself the page passes `onFile`/`onText` to score in place
 * instead of navigating — same inputs, different owner.
 */
const ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"

interface LandingDropzoneProps {
  source: string
  /** When set, the parent owns scoring (the /cv-preview direct-hit case). When
   *  omitted, the dropzone stashes the file/text and navigates to /cv-preview. */
  onFile?: (file: File) => void
  onText?: (text: string) => void
  busy?: boolean
}

export function LandingDropzone({ source, onFile, onText, busy }: LandingDropzoneProps) {
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

  return (
    <div className="lp-dz-wrap">
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
          <span className="lp-dropzone-title">
            {pending ? "Reading your CV…" : "Upload CV — PDF or DOCX"}
          </span>
          <span className="lp-dropzone-trust">Private · saved only if you create an account</span>
        </span>
        <span className="lp-dropzone-btn" aria-hidden>
          {pending ? "Scoring…" : "Choose file"}
        </span>
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
        <button
          type="button"
          className="lp-dropzone-paste-toggle"
          onClick={() => setPasteOpen(true)}
          disabled={pending}
        >
          Upload not working? Paste your CV text instead
        </button>
      )}
    </div>
  )
}
