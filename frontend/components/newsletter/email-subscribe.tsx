"use client"

import { useState, useRef } from "react"
import { newsletter, type NewsletterSource } from "@/lib/api"

export function EmailSubscribe({
  compact = false,
  source = "newsletter_page",
}: {
  compact?: boolean
  source?: NewsletterSource
}) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async () => {
    if (state === "loading" || state === "success") return
    const val = inputRef.current?.value.trim() ?? ""
    if (!val || !val.includes("@")) {
      setErrorMsg("Enter a valid email address.")
      setState("error")
      inputRef.current?.focus()
      return
    }
    setState("loading")
    try {
      await newsletter.subscribe(val, source)
      setState("success")
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Could not subscribe. Try again.")
      setState("error")
      inputRef.current?.focus()
    }
  }

  const handleInput = () => {
    if (state === "error") setState("idle")
  }

  const isDone = state === "success"
  const isBusy = state === "loading"

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: compact ? 0 : "32px 0" }}>
      <div style={compact ? {
        display: "flex",
        flexDirection: "column",
        gap: 8,
      } : {
        display: "flex",
        gap: 8,
        alignItems: "center",
        padding: "20px 24px",
        background: "var(--tm-surface)",
        border: "1px solid var(--tm-border-soft)",
        borderRadius: "var(--tm-radius-lg)",
      }}>
        <input
          ref={inputRef}
          type="email"
          placeholder="Your email address"
          disabled={isDone}
          onInput={handleInput}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit() }}
          aria-label="Email address for newsletter"
          aria-invalid={state === "error"}
          style={{
            flex: 1,
            height: 40,
            padding: "0 14px",
            background: "var(--tm-surface-2)",
            border: `1px solid ${state === "error" ? "var(--tm-danger)" : "var(--tm-border)"}`,
            borderRadius: "var(--tm-radius)",
            color: "var(--tm-text)",
            fontFamily: "var(--tm-font-sans)",
            fontSize: 14,
            outline: "none",
            transition: "border-color var(--tm-dur) var(--tm-ease), box-shadow var(--tm-dur) var(--tm-ease)",
          }}
          onFocus={(e) => {
            if (state !== "error") {
              e.currentTarget.style.borderColor = "var(--tm-interactive)"
              e.currentTarget.style.boxShadow = "0 0 0 3px var(--tm-int-bg-wash)"
            }
          }}
          onBlur={(e) => {
            if (state !== "error") {
              e.currentTarget.style.borderColor = "var(--tm-border)"
              e.currentTarget.style.boxShadow = "none"
            }
          }}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isDone || isBusy}
          style={{
            height: 40,
            padding: "0 20px",
            background: isDone ? "var(--tm-success)" : "var(--tm-interactive)",
            color: "var(--tm-interactive-fg)",
            border: "none",
            borderRadius: "var(--tm-radius)",
            fontFamily: "var(--tm-font-sans)",
            fontSize: 14,
            fontWeight: 600,
            cursor: isDone ? "default" : isBusy ? "wait" : "pointer",
            opacity: isBusy ? 0.7 : 1,
            whiteSpace: "nowrap",
            transition: "background var(--tm-dur) var(--tm-ease), box-shadow var(--tm-dur) var(--tm-ease)",
          }}
          onMouseEnter={(e) => {
            if (!isDone && !isBusy) {
              e.currentTarget.style.background = "var(--tm-interactive-hover)"
              e.currentTarget.style.boxShadow = "var(--tm-shadow-glow)"
            }
          }}
          onMouseLeave={(e) => {
            if (!isDone && !isBusy) {
              e.currentTarget.style.background = "var(--tm-interactive)"
              e.currentTarget.style.boxShadow = "none"
            }
          }}
        >
          {isDone ? "✓ Subscribed!" : isBusy ? "Subscribing…" : "Subscribe free"}
        </button>
      </div>
      {state === "error" && errorMsg && (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--tm-danger)" }}>
          {errorMsg}
        </p>
      )}
    </div>
  )
}
