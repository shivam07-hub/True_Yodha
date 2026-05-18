"use client"

import { useEffect, useState } from "react"

import { users as usersApi } from "@/lib/api"
import { getAccessToken } from "@/lib/session"

export interface NinjaNameStepProps {
  /** Called when user accepts (custom or suggested). */
  onAccept: (name: string) => void
  /** Called when user opts to keep the auto-default — onboarding does not block. */
  onSkip: () => void
}

const NAME_RE = /^[a-z0-9-]{3,32}$/

/**
 * Onboarding step for picking a public ninja_name (vanity slug).
 * Auto-fetches a suggestion. Always skippable per SH2.
 */
export function NinjaNameStep({ onAccept, onSkip }: NinjaNameStepProps) {
  const [suggested, setSuggested] = useState<string | null>(null)
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = getAccessToken()
    if (!token) return
    let cancelled = false
    usersApi
      .suggestNinjaName(token)
      .then((res) => {
        if (cancelled) return
        setSuggested(res.ninja_name)
        setValue(res.ninja_name)
      })
      .catch(() => {
        if (!cancelled) setError("Could not generate a suggestion — try typing one.")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const submit = async (chosen: string) => {
    const token = getAccessToken()
    if (!token) return
    if (!NAME_RE.test(chosen)) {
      setError("Use 3–32 lowercase letters, digits, or hyphens.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await usersApi.updateNinjaName(token, chosen)
      onAccept(res.ninja_name)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't claim that name."
      setError(msg.includes("taken") ? "That name is taken — pick another." : msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        maxWidth: 460,
        margin: "0 auto",
        textAlign: "center",
      }}
    >
      <h2 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Pick your ninja name</h2>
      <p style={{ margin: 0, color: "var(--tm-text-faint)", fontSize: 14, lineHeight: 1.5 }}>
        This is your public profile address — the link friends open to see your
        domain map. You can change it later from Settings.
      </p>

      <label
        htmlFor="ninja-name-input"
        style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginTop: 8 }}
      >
        myro.app/profile/
      </label>
      <input
        id="ninja-name-input"
        type="text"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          setValue(e.target.value.toLowerCase())
          setError(null)
        }}
        placeholder={suggested ?? "your-ninja-name"}
        style={{
          padding: "10px 14px",
          fontSize: 16,
          fontFamily: "var(--tm-font-mono)",
          background: "var(--tm-surface-1)",
          color: "var(--tm-text)",
          border: "1px solid var(--tm-border)",
          borderRadius: 8,
          textAlign: "center",
        }}
      />

      {error ? (
        <p style={{ margin: 0, color: "var(--tm-danger, #ff8080)", fontSize: 13 }}>{error}</p>
      ) : null}

      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 8 }}>
        <button
          type="button"
          onClick={() => submit(value)}
          disabled={busy || !value}
          style={{
            padding: "10px 20px",
            fontSize: 14,
            color: "var(--tm-bg)",
            background: "var(--tm-accent)",
            border: "none",
            borderRadius: 8,
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Claiming…" : "Use this name"}
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          style={{
            padding: "10px 20px",
            fontSize: 14,
            color: "var(--tm-text-faint)",
            background: "transparent",
            border: "1px solid var(--tm-border)",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          Skip
        </button>
      </div>
    </div>
  )
}
