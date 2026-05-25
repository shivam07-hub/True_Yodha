"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import { preflightCVUploadFile } from "@/lib/cv-file-detect"
import { signupEvents } from "@/lib/analytics"
import { LinkedInDisclosure } from "@/components/auth/shared/linkedin-disclosure"
import type { CVUploadSource } from "@/lib/api"

type Mode = "upload" | "describe" | "linkedin"

const MIN_WORDS = 30

const PROMPTS = [
  "I've spent the last few years building...",
  "The thing I'm genuinely good at is...",
  "I recently shipped / led / designed...",
  "Day-to-day I work with...",
  "What I want to do next is...",
]

const NUDGES = ["A role you've held", "Something you shipped", "Skills you use daily", "What you're learning", "Where you want to go"]

const LINKEDIN_STEPS = [
  "Open your LinkedIn profile on desktop or mobile.",
  "Tap More → Save to PDF (under the contact button).",
  "Drop the saved file below.",
]

interface Props {
  /** Called with (file, source) so the upload pipeline can tag the cohort. */
  onNext: (file: File, source: CVUploadSource) => void
  onNextText?: (text: string) => void
  /** ADR-0006 L3 — auto-select segment from auth provider. */
  defaultMode?: Mode
}

export function StepCV({ onNext, onNextText, defaultMode = "upload" }: Props) {
  const [mode, setMode] = useState<Mode>(defaultMode)

  useEffect(() => {
    setMode(defaultMode)
  }, [defaultMode])

  // upload state (shared by upload + linkedin segments)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // describe state
  const [text, setText] = useState("")
  const [textFocused, setTextFocused] = useState(false)
  const [describeError, setDescribeError] = useState<string | null>(null)
  const [promptIdx, setPromptIdx] = useState(0)
  const [promptVisible, setPromptVisible] = useState(true)

  useEffect(() => {
    if (text) return
    const id = setInterval(() => {
      setPromptVisible(false)
      setTimeout(() => {
        setPromptIdx((i) => (i + 1) % PROMPTS.length)
        setPromptVisible(true)
      }, 350)
    }, 3200)
    return () => clearInterval(id)
  }, [text])

  function selectMode(next: Mode) {
    if (next === mode) return
    setMode(next)
    setUploadError(null)
    setDescribeError(null)
    const sourceMap: Record<Mode, CVUploadSource> = {
      upload: "pdf_upload",
      describe: "text_describe",
      linkedin: "linkedin_pdf",
    }
    signupEvents.cvInputSourceSelected({ source: sourceMap[next] })
  }

  async function handleFile(file: File) {
    const preflight = await preflightCVUploadFile(file)
    if (!preflight.ok) { setUploadError(preflight.message); return }
    setUploadError(null)
    const safeFile =
      file.type === preflight.mime && file.name === preflight.safeName
        ? file
        : new File([file], preflight.safeName, { type: preflight.mime })
    const source: CVUploadSource = mode === "linkedin" ? "linkedin_pdf" : "pdf_upload"
    onNext(safeFile, source)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void handleFile(file)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0
  const canSubmit = wordCount >= MIN_WORDS

  function handleDescribeSubmit() {
    if (!canSubmit) { setDescribeError(`Write at least ${MIN_WORDS} words so we can find your skills.`); return }
    setDescribeError(null)
    onNextText?.(text.trim())
  }

  const segments: Array<{ id: Mode; label: string }> = [
    { id: "upload", label: "Upload PDF" },
    { id: "describe", label: "Describe" },
    { id: "linkedin", label: "LinkedIn" },
  ]

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, width: "100%", maxWidth: 560 }}>

      {/* Mode toggle — 3 segments */}
      <div role="tablist" style={{
        display: "flex", gap: 2, padding: 3,
        borderRadius: 999,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid var(--tm-border-soft)",
      }}>
        {segments.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={mode === id}
            onClick={() => selectMode(id)}
            style={{
              padding: "7px 18px",
              borderRadius: 999,
              border: "none",
              background: mode === id ? "var(--tm-accent)" : "transparent",
              color: mode === id ? "var(--tm-bg)" : "var(--tm-text-muted)",
              fontSize: 13, fontWeight: mode === id ? 600 : 400,
              cursor: "pointer",
              fontFamily: "inherit",
              letterSpacing: "0.01em",
              transition: "all var(--tm-dur) var(--tm-ease)",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {(mode === "upload" || mode === "linkedin") && (
        <>
          <div style={{ textAlign: "center" }}>
            <h2 style={{ fontSize: "var(--tm-fs-title)", fontWeight: 700, color: "var(--tm-text)", marginBottom: 8, letterSpacing: "var(--tm-tracking-tight)" }}>
              {mode === "upload" ? "Upload your CV" : "Import from LinkedIn"}
            </h2>
            <p style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-muted)" }}>
              {mode === "upload" ? "PDF or DOCX · max 10MB" : "Save your LinkedIn as PDF, then drop it here"}
            </p>
          </div>

          {mode === "linkedin" && (
            <ol style={{
              listStyle: "decimal", paddingLeft: 20, margin: 0,
              fontSize: 13.5, lineHeight: 1.65, color: "var(--tm-text-muted)",
              width: "100%", maxWidth: 440, alignSelf: "center",
            }}>
              {LINKEDIN_STEPS.map((s) => <li key={s}>{s}</li>)}
            </ol>
          )}

          <button
            type="button"
            tabIndex={0}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click() } }}
            aria-label={mode === "upload"
              ? "Upload CV — click or drag and drop a PDF or DOCX file"
              : "Drop your LinkedIn PDF here, or click to browse"}
            style={{
              width: "100%",
              border: `2px dashed ${dragging ? "var(--tm-accent)" : "var(--tm-border)"}`,
              borderRadius: "var(--tm-radius-lg)",
              padding: "48px 32px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
              cursor: "pointer",
              background: dragging ? "var(--tm-accent-wash)" : "rgba(255,255,255,0.02)",
              fontFamily: "inherit",
              outline: "none",
              transition: "border-color var(--tm-dur) var(--tm-ease), background var(--tm-dur) var(--tm-ease)",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--tm-accent-ring)"; e.currentTarget.style.boxShadow = "0 0 0 3px var(--tm-accent-wash)" }}
            onBlur={(e) => { e.currentTarget.style.borderColor = dragging ? "var(--tm-accent)" : "var(--tm-border)"; e.currentTarget.style.boxShadow = "none" }}
          >
            <span aria-hidden="true" style={{ fontSize: 37, lineHeight: 1 }}>{mode === "linkedin" ? "in" : "📄"}</span>
            <span style={{ fontSize: "var(--tm-fs-body)", fontWeight: 500, color: "var(--tm-text)" }}>
              {mode === "linkedin" ? "Drop the LinkedIn PDF" : "Drag and drop your CV here"}
            </span>
            <span style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-muted)" }}>
              or press Enter / Space to browse
            </span>
          </button>

          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            style={{ display: "none" }}
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }}
          />

          {uploadError && (
            <p role="alert" style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-danger)" }}>{uploadError}</p>
          )}

          {mode === "linkedin" && <LinkedInDisclosure surface="step_cv" variant="cv" />}
        </>
      )}

      {mode === "describe" && (
        <>
          <div style={{ textAlign: "center", width: "100%" }}>
            <h2 style={{
              fontSize: "var(--tm-fs-title)", fontWeight: 700,
              color: "var(--tm-text)", marginBottom: 0,
              letterSpacing: "var(--tm-tracking-tight)", lineHeight: 1.3,
            }}>
              Just tell us who you are and what skills you bring to the table.
            </h2>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, width: "100%", justifyContent: "center" }}>
            {NUDGES.map((n) => (
              <span key={n} style={{
                padding: "4px 11px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid var(--tm-border-soft)",
                fontSize: 12, color: "var(--tm-text-faint)",
                letterSpacing: "0.01em",
              }}>{n}</span>
            ))}
          </div>

          <div style={{ position: "relative", width: "100%" }}>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); if (describeError) setDescribeError(null) }}
              onFocus={() => setTextFocused(true)}
              onBlur={() => setTextFocused(false)}
              rows={9}
              aria-label="Describe yourself professionally"
              style={{
                width: "100%",
                padding: "18px 20px 48px",
                borderRadius: "var(--tm-radius-lg)",
                border: `1px solid ${textFocused ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
                background: "rgba(255,255,255,0.025)",
                color: "var(--tm-text)",
                fontSize: "var(--tm-fs-body)",
                fontFamily: "inherit",
                lineHeight: 1.75,
                resize: "vertical",
                outline: "none",
                boxShadow: textFocused ? "0 0 0 3px var(--tm-accent-wash)" : "none",
                transition: "border-color var(--tm-dur) var(--tm-ease), box-shadow var(--tm-dur) var(--tm-ease)",
                boxSizing: "border-box",
              }}
            />

            {!text && (
              <div
                aria-hidden="true"
                style={{
                  position: "absolute", top: 18, left: 20, right: 20,
                  pointerEvents: "none",
                  color: "var(--tm-text-faint)",
                  fontSize: "var(--tm-fs-body)",
                  lineHeight: 1.75,
                  opacity: promptVisible ? 0.6 : 0,
                  transition: "opacity 350ms ease",
                  fontStyle: "italic",
                }}
              >
                {PROMPTS[promptIdx]}
              </div>
            )}

            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              padding: "10px 16px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              borderTop: "1px solid var(--tm-border-soft)",
              borderRadius: "0 0 var(--tm-radius-lg) var(--tm-radius-lg)",
              background: "rgba(0,0,0,0.2)",
              pointerEvents: "none",
            }}>
              <div style={{ display: "flex", gap: 4, flex: 1, maxWidth: 120 }}>
                {Array.from({ length: MIN_WORDS }).map((_, i) => (
                  <div key={i} style={{
                    flex: 1, height: 2, borderRadius: 1,
                    background: i < wordCount ? "var(--tm-accent)" : "rgba(255,255,255,0.1)",
                    transition: "background 150ms",
                  }} />
                ))}
              </div>
              <span style={{
                fontSize: 11,
                color: canSubmit ? "var(--tm-success)" : "var(--tm-text-faint)",
                fontVariantNumeric: "tabular-nums",
                transition: "color var(--tm-dur)",
              }}>
                {wordCount} {wordCount === 1 ? "word" : "words"}
                {!canSubmit && wordCount > 0 && ` · ${MIN_WORDS - wordCount} more`}
                {canSubmit && " · ready"}
              </span>
            </div>
          </div>

          {describeError && (
            <p role="alert" style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-danger)", alignSelf: "flex-start" }}>
              {describeError}
            </p>
          )}

          <button
            type="button"
            onClick={handleDescribeSubmit}
            disabled={!canSubmit}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "var(--tm-radius-sm)",
              background: canSubmit ? "var(--tm-accent)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${canSubmit ? "var(--tm-accent)" : "var(--tm-border-soft)"}`,
              color: canSubmit ? "var(--tm-bg)" : "var(--tm-text-faint)",
              fontSize: "var(--tm-fs-meta)", fontWeight: 700,
              cursor: canSubmit ? "pointer" : "default",
              fontFamily: "inherit",
              transition: "all var(--tm-dur) var(--tm-ease)",
              letterSpacing: "0.02em",
            }}
          >
            Find my skills →
          </button>
        </>
      )}
    </div>
  )
}
