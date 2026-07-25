"use client"

import { useState } from "react"
import { users } from "@/lib/api"
import { clearSessionTokens } from "@/lib/session"

export function AccountDeletionPanel({ token }: { token: string | null }) {
  const [confirming, setConfirming] = useState(false)
  const [confirmation, setConfirmation] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function erase() {
    if (!token || confirmation !== "DELETE") return
    setBusy(true)
    setError(null)
    try {
      await users.deleteAccount(token)
      clearSessionTokens()
      try {
        window.sessionStorage.clear()
      } catch {
        // The account is already erased server-side.
      }
      window.location.replace("/")
    } catch {
      setBusy(false)
      setError("Deletion could not be completed. Retry, or contact grievance@himyro.com.")
    }
  }

  if (!confirming) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 12 }}>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          style={{
            border: "1px solid var(--tm-danger)",
            borderRadius: "var(--tm-radius-sm)",
            background: "transparent",
            color: "var(--tm-danger)",
            cursor: "pointer",
            font: "inherit",
            fontSize: 12,
            fontWeight: 700,
            padding: "9px 14px",
          }}
        >
          Delete account
        </button>
      </div>
    )
  }

  return (
    <div
      style={{
        marginTop: 12,
        border: "1px solid var(--tm-danger)",
        borderRadius: "var(--tm-radius-sm)",
        padding: 14,
      }}
    >
      <label htmlFor="delete-account-confirm" style={{ color: "var(--tm-text)", fontSize: 12 }}>
        Type DELETE to permanently erase your account, CVs, activity, and profile.
      </label>
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <input
          id="delete-account-confirm"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="off"
          style={{
            flex: "1 1 150px",
            border: "1px solid var(--tm-border)",
            borderRadius: "var(--tm-radius-sm)",
            background: "var(--tm-surface)",
            color: "var(--tm-text)",
            font: "inherit",
            padding: "9px 10px",
          }}
        />
        <button
          type="button"
          disabled={busy || confirmation !== "DELETE"}
          onClick={() => void erase()}
          style={{
            border: 0,
            borderRadius: "var(--tm-radius-sm)",
            background: "var(--tm-danger)",
            color: "white",
            cursor: busy ? "wait" : "pointer",
            font: "inherit",
            fontSize: 12,
            fontWeight: 700,
            opacity: busy || confirmation !== "DELETE" ? 0.45 : 1,
            padding: "9px 14px",
          }}
        >
          {busy ? "Deleting…" : "Erase permanently"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setConfirming(false)
            setConfirmation("")
            setError(null)
          }}
          style={{
            border: 0,
            background: "transparent",
            color: "var(--tm-text-muted)",
            cursor: "pointer",
            font: "inherit",
            padding: "9px",
          }}
        >
          Cancel
        </button>
      </div>
      {error && <div role="alert" style={{ color: "var(--tm-danger)", fontSize: 12, marginTop: 10 }}>{error}</div>}
    </div>
  )
}
