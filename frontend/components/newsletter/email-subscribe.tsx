"use client"

import { useState, useRef } from "react"

export function EmailSubscribe() {
  const [state, setState] = useState<"idle" | "success" | "error">("idle")
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = () => {
    const val = inputRef.current?.value.trim() ?? ""
    if (!val || !val.includes("@")) {
      setState("error")
      inputRef.current?.focus()
      return
    }
    setState("success")
  }

  const handleInput = () => {
    if (state === "error") setState("idle")
  }

  return (
    <div style={{
      display: "flex",
      gap: 8,
      alignItems: "center",
      margin: "32px 0",
      padding: "20px 24px",
      background: "var(--tm-surface)",
      border: "1px solid var(--tm-border-soft)",
      borderRadius: "var(--tm-radius-lg)",
    }}>
      <input
        ref={inputRef}
        type="email"
        placeholder="Your email address"
        disabled={state === "success"}
        onInput={handleInput}
        aria-label="Email address for newsletter"
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
        disabled={state === "success"}
        style={{
          height: 40,
          padding: "0 20px",
          background: state === "success" ? "var(--tm-success)" : "var(--tm-interactive)",
          color: "var(--tm-interactive-fg)",
          border: "none",
          borderRadius: "var(--tm-radius)",
          fontFamily: "var(--tm-font-sans)",
          fontSize: 14,
          fontWeight: 600,
          cursor: state === "success" ? "default" : "pointer",
          whiteSpace: "nowrap",
          transition: "background var(--tm-dur) var(--tm-ease), box-shadow var(--tm-dur) var(--tm-ease)",
        }}
        onMouseEnter={(e) => {
          if (state !== "success") {
            e.currentTarget.style.background = "var(--tm-interactive-hover)"
            e.currentTarget.style.boxShadow = "var(--tm-shadow-glow)"
          }
        }}
        onMouseLeave={(e) => {
          if (state !== "success") {
            e.currentTarget.style.background = "var(--tm-interactive)"
            e.currentTarget.style.boxShadow = "none"
          }
        }}
      >
        {state === "success" ? "✓ Subscribed!" : "Subscribe free"}
      </button>
    </div>
  )
}
