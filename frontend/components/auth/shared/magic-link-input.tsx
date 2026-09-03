"use client"

import { useEffect, useState } from "react"
import { MAGIC_EMAIL_RE, sendMagicLink } from "@/lib/auth/send-magic-link"
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

  const valid = MAGIC_EMAIL_RE.test(email.trim())

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null)
    setSending(true)
    try {
      onSent?.(await sendMagicLink({ email, redirectTo, surface }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the link.")
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
