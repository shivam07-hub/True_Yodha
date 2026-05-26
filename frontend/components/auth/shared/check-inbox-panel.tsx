"use client"

import { useEffect, useState } from "react"
import { auth } from "@/lib/api"
import { hashEmailDomain, signupEvents } from "@/lib/analytics"
import "./auth-shared.css"

interface Props {
  email: string
  redirectTo?: string | null
  onChangeEmail: () => void
}

const RESEND_WINDOW_MS = 30_000

export function CheckInboxPanel({ email, redirectTo, onChangeEmail }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(RESEND_WINDOW_MS / 1000)
  const [resending, setResending] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (secondsLeft <= 0) return
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [secondsLeft])

  async function resend() {
    setResending(true)
    setNote(null)
    try {
      await auth.magicLinkRequest(email, redirectTo)
      signupEvents.magicLinkSent({ email_domain_hash: hashEmailDomain(email) })
      setSecondsLeft(RESEND_WINDOW_MS / 1000)
      setNote("Sent again — check your inbox.")
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Couldn't resend just now.")
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="tm-auth-check-inbox">
      <div className="tm-auth-check-inbox__icon" aria-hidden="true">✉</div>
      <div>
        <h3 style={{
          margin: 0, fontSize: 18, fontWeight: 700, color: "var(--tm-text)",
          letterSpacing: "-0.01em",
        }}>
          Check your inbox
        </h3>
        <p style={{
          margin: "6px 0 0", fontSize: 14, color: "var(--tm-text-muted)", lineHeight: 1.55,
        }}>
          A sign-in link is on its way to <strong style={{ color: "var(--tm-text)" }}>{email}</strong>.
          It expires in 10 minutes.
        </p>
      </div>
      <div style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>
        Didn&apos;t arrive?{" "}
        <button
          type="button"
          className="tm-auth-check-inbox__resend"
          onClick={resend}
          disabled={resending || secondsLeft > 0}
        >
          {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : resending ? "Sending…" : "Resend"}
        </button>
        {" · "}
        <button type="button" className="tm-auth-check-inbox__resend" onClick={onChangeEmail}>
          Change email
        </button>
      </div>
      <div style={{ fontSize: 12, color: "var(--tm-text-faint)", marginTop: 6 }}>
        Tip: check spam, or whitelist <code>noreply@himyro.com</code>.
      </div>
      {note && (
        <p role="status" style={{
          fontSize: 13, color: "var(--tm-interactive-text)", marginTop: 4,
        }}>{note}</p>
      )}
    </div>
  )
}
