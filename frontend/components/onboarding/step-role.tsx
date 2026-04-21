"use client"

import { useState, useRef } from "react"

const MAX_ROLES = 3

interface Props {
  onNext: (roles: string[], location: string) => void
  loading: boolean
}

export function StepRole({ onNext, loading }: Props) {
  const [roles, setRoles] = useState<string[]>([])
  const [input, setInput] = useState("")
  const [location, setLocation] = useState("")
  const [inputFocused, setInputFocused] = useState(false)
  const [locFocused, setLocFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function addRole() {
    const trimmed = input.trim()
    if (!trimmed || roles.length >= MAX_ROLES) return
    if (roles.map((r) => r.toLowerCase()).includes(trimmed.toLowerCase())) {
      setInput("")
      return
    }
    setRoles((r) => [...r, trimmed])
    setInput("")
    inputRef.current?.focus()
  }

  function removeRole(i: number) {
    setRoles((r) => r.filter((_, idx) => idx !== i))
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); addRole() }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (roles.length === 0 || !location.trim()) return
    onNext(roles, location.trim())
  }

  const atMax = roles.length >= MAX_ROLES
  const canSubmit = roles.length > 0 && location.trim().length > 0 && !loading

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32, width: "100%", maxWidth: 460 }}>

      {/* Header */}
      <div style={{ textAlign: "center" }}>
        <div style={{
          display: "inline-block",
          fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
          color: "var(--tm-accent)", marginBottom: 12,
          padding: "3px 10px", borderRadius: 999,
          background: "var(--tm-accent-wash)",
          border: "1px solid var(--tm-accent-ring)",
        }}>
          Step 2 of 3
        </div>
        <h2 style={{
          fontSize: "var(--tm-fs-title)", fontWeight: 700,
          color: "var(--tm-text)", marginBottom: 8, lineHeight: 1.2,
        }}>
          What roles are you targeting?
        </h2>
        <p style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-muted)", lineHeight: 1.6 }}>
          Add up to {MAX_ROLES} roles. We&apos;ll match your gaps against live job postings for each.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Role input row */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <label style={{ fontSize: "var(--tm-fs-meta)", fontWeight: 600, color: "var(--tm-text-muted)" }}>
              Target role
            </label>
            <span style={{
              fontSize: 11, color: atMax ? "var(--tm-warning)" : "var(--tm-text-faint)",
              fontVariantNumeric: "tabular-nums",
            }}>
              {roles.length} / {MAX_ROLES}
            </span>
          </div>

          <div style={{
            display: "flex", gap: 8,
            padding: "4px",
            borderRadius: "var(--tm-radius-sm)",
            border: `1px solid ${inputFocused ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
            background: "rgba(255,255,255,0.03)",
            transition: "border-color var(--tm-dur) var(--tm-ease)",
          }}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={atMax ? "Max 3 roles reached" : "e.g. Data Scientist"}
              disabled={atMax}
              style={{
                flex: 1,
                padding: "8px 10px",
                background: "transparent",
                border: "none",
                color: "var(--tm-text)",
                fontSize: "var(--tm-fs-meta)",
                fontFamily: "inherit",
                outline: "none",
                opacity: atMax ? 0.35 : 1,
              }}
            />
            <button
              type="button"
              onClick={addRole}
              disabled={!input.trim() || atMax}
              style={{
                padding: "8px 14px",
                borderRadius: "calc(var(--tm-radius-sm) - 2px)",
                background: input.trim() && !atMax ? "var(--tm-accent)" : "transparent",
                border: `1px solid ${input.trim() && !atMax ? "var(--tm-accent)" : "var(--tm-border-soft)"}`,
                color: input.trim() && !atMax ? "var(--tm-bg)" : "var(--tm-text-faint)",
                fontSize: 13, fontWeight: 700,
                cursor: input.trim() && !atMax ? "pointer" : "default",
                fontFamily: "inherit",
                transition: "all var(--tm-dur) var(--tm-ease)",
                flexShrink: 0,
              }}
            >
              Add ↵
            </button>
          </div>

          {/* Role tags */}
          {roles.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {roles.map((role, i) => (
                <div key={i} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "5px 8px 5px 12px",
                  borderRadius: 999,
                  background: "var(--tm-accent-wash)",
                  border: "1px solid var(--tm-accent-ring)",
                  fontSize: 13, color: "var(--tm-accent)",
                  animation: "tagIn 180ms var(--tm-ease) both",
                }}>
                  <span style={{ fontWeight: 500 }}>{role}</span>
                  <button
                    type="button"
                    onClick={() => removeRole(i)}
                    aria-label={`Remove ${role}`}
                    style={{
                      width: 16, height: 16, borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "rgba(0,245,212,0.15)",
                      border: "none", padding: 0,
                      cursor: "pointer", color: "var(--tm-accent)",
                      fontSize: 12, lineHeight: 1,
                      transition: "background var(--tm-dur)",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,245,212,0.3)" }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,245,212,0.15)" }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Location */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: "var(--tm-fs-meta)", fontWeight: 600, color: "var(--tm-text-muted)" }}>
            Location
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onFocus={() => setLocFocused(true)}
            onBlur={() => setLocFocused(false)}
            placeholder="e.g. Mumbai, India"
            style={{
              padding: "11px 14px",
              borderRadius: "var(--tm-radius-sm)",
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${locFocused ? "var(--tm-accent-ring)" : "var(--tm-border-soft)"}`,
              color: "var(--tm-text)",
              fontSize: "var(--tm-fs-meta)",
              fontFamily: "inherit",
              outline: "none",
              transition: "border-color var(--tm-dur) var(--tm-ease)",
            }}
          />
        </div>

        {/* Helper note */}
        {roles.length > 0 && (
          <p style={{ fontSize: 12, color: "var(--tm-text-faint)", lineHeight: 1.6, marginTop: -8 }}>
            Gap analysis will use live job postings for{" "}
            <span style={{ color: "var(--tm-accent)" }}>{roles.join(", ")}</span>
            {" "}to find what skills you need to close.
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            marginTop: 4,
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
          {loading ? "Analysing your CV…" : "Get my Mirror Score →"}
        </button>
      </form>

      <style>{`
        @keyframes tagIn {
          from { opacity: 0; transform: scale(0.85) translateY(4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}
