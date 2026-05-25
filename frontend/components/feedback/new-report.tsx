"use client"

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react"
import { useMutation } from "@tanstack/react-query"
import { feedback as feedbackApi } from "@/lib/api"
import { useAuth } from "@/lib/hooks/use-auth"
import { CategoryCard } from "./category-card"
import { useContextSnapshot } from "./use-context-snapshot"
import {
  CATEGORIES,
  CATEGORY_ORDER,
  SEVERITY,
  type FeedbackCategory,
  type FeedbackSubmissionPayload,
} from "./feedback-types"

interface Screenshot {
  id: string
  url: string
  name: string
  size: number
}

function ContextRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 0",
        borderBottom: "1px dashed var(--tm-border-soft)",
      }}
    >
      <span className="eyebrow" style={{ fontSize: 10 }}>
        {label}
      </span>
      <span
        style={{
          fontFamily: mono ? "var(--tm-font-mono)" : "inherit",
          fontSize: 12,
          color: "var(--tm-text-muted)",
          textAlign: "right",
          maxWidth: "65%",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </span>
    </div>
  )
}

export function NewReport({
  defaultCategory,
  showContext,
  userName,
  userEmail,
  onSent,
  onPinElement,
  pinnedTarget,
  onClearPin,
}: {
  defaultCategory: FeedbackCategory
  showContext: boolean
  userName: string | null
  userEmail: string | null
  onSent: (category: FeedbackCategory) => void
  onPinElement?: () => void
  pinnedTarget: string | null
  onClearPin: () => void
}) {
  const { token } = useAuth()
  const [category, setCategory] = useState<FeedbackCategory>(defaultCategory)
  const [severity, setSeverity] = useState<"low" | "medium" | "blocker">("medium")
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [emailMe, setEmailMe] = useState(true)
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const objectUrlsRef = useRef<string[]>([])
  const context = useContextSnapshot()

  useEffect(() => {
    setCategory(defaultCategory)
  }, [defaultCategory])

  useEffect(() => {
    function handler(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      for (const it of Array.from(items)) {
        if (it.type.startsWith("image/")) {
          const file = it.getAsFile()
          if (file) addScreenshot(file)
        }
      }
    }
    window.addEventListener("paste", handler)
    return () => window.removeEventListener("paste", handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => {
      for (const u of objectUrlsRef.current) URL.revokeObjectURL(u)
      objectUrlsRef.current = []
    }
  }, [])

  function addScreenshot(file: File) {
    const url = URL.createObjectURL(file)
    objectUrlsRef.current.push(url)
    setScreenshots((s) => [
      ...s,
      {
        id: Math.random().toString(36).slice(2),
        url,
        name: file.name || "screenshot.png",
        size: file.size,
      },
    ])
  }

  function removeScreenshot(id: string) {
    setScreenshots((ss) => ss.filter((x) => x.id !== id))
  }

  const c = CATEGORIES[category]
  const canSubmit = title.trim().length >= 3 && body.trim().length >= 8

  const mutation = useMutation({
    mutationFn: async () => {
      if (!context) throw new Error("Context not ready")
      const payload: FeedbackSubmissionPayload = {
        category,
        severity: category === "bug" ? severity : null,
        title: title.trim(),
        body: body.trim(),
        email_me: emailMe,
        pinned_target: pinnedTarget,
        screenshots: screenshots.map((s) => ({ name: s.name, size: s.size })),
        context: {
          ...context,
          // Best-effort enrichment with current user identity (server has the
          // canonical source via token; this is just for triage convenience)
          ...(userName ? { user_name: userName } : {}),
          ...(userEmail ? { user_email: userEmail } : {}),
        } as FeedbackSubmissionPayload["context"],
      }
      return feedbackApi.submit(category, payload as unknown as Record<string, unknown>, token ?? undefined)
    },
    onSuccess: () => {
      onSent(category)
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : "Failed to send")
    },
  })

  function submit() {
    if (!canSubmit) return
    setError(null)
    mutation.mutate()
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    for (const f of Array.from(e.dataTransfer.files)) {
      if (f.type.startsWith("image/")) addScreenshot(f)
    }
  }

  function onFilePick(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    for (const f of Array.from(files)) addScreenshot(f)
    e.target.value = ""
  }

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: 22, paddingBottom: 8 }}>
      {/* Category picker */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>What kind of signal?</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {CATEGORY_ORDER.map((id) => (
            <CategoryCard key={id} category={id} active={category === id} onClick={() => setCategory(id)} />
          ))}
        </div>
      </div>

      {/* Severity — bug only */}
      {category === "bug" && (
        <div className="fade-up">
          <div className="eyebrow" style={{ marginBottom: 10 }}>Severity</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SEVERITY.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSeverity(s.id)}
                aria-pressed={severity === s.id}
                className="hover-lift"
                style={{
                  flex: "1 1 0",
                  minWidth: 0,
                  padding: "10px 12px",
                  borderRadius: "var(--tm-radius-sm)",
                  background: severity === s.id ? `${s.color}1a` : "transparent",
                  border: `1px solid ${severity === s.id ? s.color : "var(--tm-border-soft)"}`,
                  color: severity === s.id ? s.color : "var(--tm-text-muted)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 11, opacity: 0.75, marginTop: 1 }}>{s.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Title */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Headline</div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            category === "bug" ? "Forge timer resets when I switch tabs" : "One-line summary"
          }
          style={{
            width: "100%",
            padding: "11px 14px",
            borderRadius: "var(--tm-radius-sm)",
            background: "rgba(255,255,255,0.025)",
            border: "1px solid var(--tm-border-soft)",
            color: "var(--tm-text)",
            fontSize: 13,
            outline: "none",
            transition: "border-color 160ms",
            fontFamily: "inherit",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = c.color
            e.currentTarget.style.boxShadow = `0 0 0 2px ${c.wash}`
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--tm-border-soft)"
            e.currentTarget.style.boxShadow = "none"
          }}
        />
      </div>

      {/* Body */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
          <span>Details</span>
          <span style={{ textTransform: "none", letterSpacing: 0, fontSize: 11, color: "var(--tm-text-faint)" }}>
            Cmd+V to paste a screenshot
          </span>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={c.placeholder}
          rows={5}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: "var(--tm-radius-sm)",
            background: "rgba(255,255,255,0.025)",
            border: "1px solid var(--tm-border-soft)",
            color: "var(--tm-text)",
            fontSize: 13,
            outline: "none",
            resize: "vertical",
            minHeight: 110,
            lineHeight: 1.6,
            fontFamily: "inherit",
            transition: "border-color 160ms",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = c.color
            e.currentTarget.style.boxShadow = `0 0 0 2px ${c.wash}`
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--tm-border-soft)"
            e.currentTarget.style.boxShadow = "none"
          }}
        />
      </div>

      {/* Attachments */}
      <div>
        <div
          className="eyebrow"
          style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <span>Attachments</span>
          {category === "bug" && onPinElement && (
            <button
              type="button"
              onClick={onPinElement}
              style={{
                background: "transparent",
                border: `1px solid ${pinnedTarget ? "var(--tm-warning)" : "var(--tm-border-soft)"}`,
                color: pinnedTarget ? "var(--tm-warning)" : "var(--tm-text-muted)",
                padding: "3px 10px",
                borderRadius: 99,
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                textTransform: "none",
                letterSpacing: 0,
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 2 L12 22 M2 12 L22 12" />
              </svg>
              {pinnedTarget ? "Re-pin element" : "Pin an element"}
            </button>
          )}
        </div>

        {pinnedTarget && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              marginBottom: 8,
              borderRadius: "var(--tm-radius-sm)",
              background: "var(--tm-warning-wash)",
              border: "1px solid var(--tm-warning)",
              color: "var(--tm-warning)",
              fontSize: 12,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--tm-warning)",
                boxShadow: "0 0 6px var(--tm-warning)",
              }}
            />
            <span className="mono" style={{ flex: 1 }}>Target: {pinnedTarget}</span>
            <button
              type="button"
              onClick={onClearPin}
              aria-label="Clear pin"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--tm-warning)",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              ×
            </button>
          </div>
        )}

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          style={{
            padding: 14,
            borderRadius: "var(--tm-radius-sm)",
            border: `1px dashed ${dragOver ? c.color : "var(--tm-border-soft)"}`,
            background: dragOver ? c.wash : "transparent",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            transition: "all 160ms var(--tm-ease)",
          }}
        >
          {screenshots.length === 0 ? (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                padding: "16px 0",
                cursor: "pointer",
                color: "var(--tm-text-faint)",
                fontSize: 12,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <circle cx="9" cy="11" r="2" />
                <path d="M21 16 L16 11 L7 19" />
              </svg>
              Drop, paste, or{" "}
              <span style={{ color: "var(--tm-interactive)", textDecoration: "underline" }}>browse</span> screenshots
              <input type="file" accept="image/*" multiple hidden onChange={onFilePick} />
            </label>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
              {screenshots.map((s) => (
                <div
                  key={s.id}
                  style={{
                    position: "relative",
                    height: 80,
                    borderRadius: 6,
                    border: "1px solid var(--tm-border-soft)",
                    overflow: "hidden",
                    background: "var(--tm-surface)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.url}
                    alt={s.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.85 }}
                  />
                  <button
                    type="button"
                    onClick={() => removeScreenshot(s.id)}
                    aria-label={`Remove ${s.name}`}
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      width: 18,
                      height: 18,
                      borderRadius: 99,
                      border: "none",
                      background: "rgba(0,0,0,0.7)",
                      color: "#fff",
                      cursor: "pointer",
                      fontSize: 12,
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <label
                style={{
                  height: 80,
                  borderRadius: 6,
                  border: "1px dashed var(--tm-border)",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--tm-text-faint)",
                  fontSize: 20,
                  cursor: "pointer",
                }}
              >
                +
                <input type="file" accept="image/*" multiple hidden onChange={onFilePick} />
              </label>
            </div>
          )}
        </div>
        {screenshots.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 10, color: "var(--tm-text-faint)" }}>
            Images stay private to this session — we record only names for triage. Full upload is on the v2 roadmap.
          </div>
        )}
      </div>

      {/* Auto-attached context */}
      {showContext && context && (
        <details
          open
          style={{
            padding: 14,
            borderRadius: "var(--tm-radius-sm)",
            background: "rgba(255,255,255,0.015)",
            border: "1px solid var(--tm-border-soft)",
          }}
        >
          <summary
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
              listStyle: "none",
              fontSize: 12,
              color: "var(--tm-text-muted)",
            }}
          >
            <span style={{ color: "var(--tm-interactive)" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            </span>
            <span className="eyebrow" style={{ flex: 1 }}>Auto-attached context</span>
            <span style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>
              Always included · helps us reproduce
            </span>
          </summary>
          <div style={{ marginTop: 10 }}>
            <ContextRow label="URL" value={context.url} />
            <ContextRow label="User agent" value={context.user_agent} />
            <ContextRow label="Viewport" value={context.viewport} />
            {userName && <ContextRow label="User" value={userName} mono={false} />}
            {userEmail && <ContextRow label="Email" value={userEmail} mono={false} />}
            {context.accent && <ContextRow label="Accent" value={context.accent} />}
          </div>
        </details>
      )}

      {/* Footer */}
      {error && (
        <div
          role="alert"
          style={{
            padding: "8px 12px",
            borderRadius: "var(--tm-radius-sm)",
            background: "var(--tm-danger-wash)",
            border: "1px solid var(--tm-danger)",
            color: "var(--tm-danger)",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          paddingTop: 8,
          borderTop: "1px solid var(--tm-border-soft)",
          flexWrap: "wrap",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            cursor: "pointer",
            fontSize: 12,
            color: "var(--tm-text-muted)",
          }}
        >
          <span
            onClick={(e) => {
              e.preventDefault()
              setEmailMe(!emailMe)
            }}
            style={{
              width: 32,
              height: 18,
              borderRadius: 99,
              background: emailMe ? c.color : "var(--tm-border)",
              position: "relative",
              transition: "background 160ms",
              display: "inline-block",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: emailMe ? 16 : 2,
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: emailMe ? "var(--tm-bg)" : "var(--tm-text-faint)",
                transition: "left 160ms",
              }}
            />
          </span>
          <input
            type="checkbox"
            checked={emailMe}
            onChange={() => setEmailMe(!emailMe)}
            hidden
            aria-hidden="true"
            tabIndex={-1}
          />
          Email me when triaged
        </label>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, color: "var(--tm-text-faint)", fontFamily: "var(--tm-font-mono)" }}>
            {c.triageHint}
          </span>
          <button
            type="button"
            disabled={!canSubmit || mutation.isPending}
            onClick={submit}
            style={{
              padding: "10px 22px",
              borderRadius: "var(--tm-radius-sm)",
              border: "none",
              background: canSubmit && !mutation.isPending ? c.color : "var(--tm-surface-2)",
              color: canSubmit && !mutation.isPending ? "var(--tm-interactive-fg)" : "var(--tm-text-faint)",
              fontSize: 13,
              fontWeight: 600,
              cursor: canSubmit && !mutation.isPending ? "pointer" : "not-allowed",
              boxShadow: canSubmit && !mutation.isPending ? `0 0 18px ${c.color}66` : "none",
              transition: "all 160ms",
              fontFamily: "inherit",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {mutation.isPending ? "Sending…" : c.submitVerb}
            <span style={{ fontSize: 14 }}>→</span>
          </button>
        </div>
      </div>
    </div>
  )
}
