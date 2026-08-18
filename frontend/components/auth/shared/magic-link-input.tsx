"use client"

import { useEffect, useState } from "react"
import { auth } from "@/lib/api"
import { rememberAuth } from "@/lib/auth/last-auth"
import { hashEmailDomain, signupEvents } from "@/lib/analytics"
import "./auth-shared.css"

interface Props {
  surface: string
  redirectTo?: string | null
  onSent?: (email: string) => void
  disabled?: boolean
  label?: string
  /** Seed the field when the caller already knows the address. */
  initialEmail?: string | null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function MagicLinkInput({
  surface,
  redirectTo,
  onSent,
  disabled,
  label = "Email me a link",
  initialEmail,
}: Props) {
  const [email, setEmail] = useState(initialEmail ?? "")
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (initialEmail) setEmail(initialEmail)
  }, [initialEmail])

  const valid = EMAIL_RE.test(email.trim())

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null)
    const value = email.trim().toLowerCase()
    if (!EMAIL_RE.test(value)) {
      setError("That doesn't look like a complete email.")
      return
    }
    setSending(true)
    try {
      signupEvents.methodTapped({ method: "magic_link", surface })
      await auth.magicLinkRequest(value, redirectTo)
      rememberAuth("magic_link", value)
      signupEvents.magicLinkSent({ email_domain_hash: hashEmailDomain(value) })
      onSent?.(value)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't send the link."
      setError(msg)
      signupEvents.failed({ method: "magic_link", stage: "send", error_code: "send_failed" })
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="tm-auth-magic-row">
        <input
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (error) setError(null) }}
          aria-invalid={error ? true : undefined}
          aria-label="Email address"
          className="tm-auth-magic-input"
          disabled={disabled || sending}
          required
        />
        <button
          type="submit"
          className="tm-auth-provider-btn tm-auth-provider-btn--primary"
          disabled={disabled || sending || !valid}
          aria-busy={sending}
        >
          {sending ? "Sending…" : label}
        </button>
      </div>
      {error && (
        <p role="alert" style={{
          marginTop: 8, fontSize: 13, color: "var(--tm-danger)", lineHeight: 1.45,
        }}>{error}</p>
      )}
    </form>
  )
}
