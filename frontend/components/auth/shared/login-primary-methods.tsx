"use client"

import { GoogleAuthButton } from "@/components/auth/shared/google-button"
import { LinkedInAuthButton } from "@/components/auth/shared/linkedin-button"
import { MagicLinkInput } from "@/components/auth/shared/magic-link-input"
import {
  loginStackOrder,
  type HighlightableAuthMethod,
} from "@/lib/auth/last-auth"

export function LastUsedLabel() {
  return (
    <p id="tm-auth-last-used" className="tm-auth-last-used-label">
      Last used
    </p>
  )
}

function OrDivider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0" }}>
      <div style={{ flex: 1, height: 1, background: "var(--tm-border-soft)" }} />
      <span style={{ fontSize: 12, color: "var(--tm-text-faint)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
        or
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--tm-border-soft)" }} />
    </div>
  )
}

interface Props {
  agent: string | null
  lastMethod: HighlightableAuthMethod | null
  surface: string
  includeMagic: boolean
  email: string
  initialEmail?: string | null
  redirectTo: string | null
  onGoogle: () => void
  onLinkedIn: () => void
  onSent: (email: string) => void
}

export function LoginPrimaryMethods({
  agent,
  lastMethod,
  surface,
  includeMagic,
  email,
  initialEmail,
  redirectTo,
  onGoogle,
  onLinkedIn,
  onSent,
}: Props) {
  const googleBtn = !agent ? (
    <>
      {lastMethod === "google" ? <LastUsedLabel /> : null}
      <GoogleAuthButton
        surface={surface}
        lastUsed={lastMethod === "google"}
        onClick={onGoogle}
      />
    </>
  ) : null

  const linkedinBtn = (
    <>
      {lastMethod === "linkedin" ? <LastUsedLabel /> : null}
      <LinkedInAuthButton
        surface={surface}
        lastUsed={lastMethod === "linkedin"}
        onClick={onLinkedIn}
      />
    </>
  )

  const oauth = lastMethod === "linkedin" ? <>{linkedinBtn}{googleBtn}</> : <>{googleBtn}{linkedinBtn}</>
  const magic = (
    <>
      {lastMethod === "magic_link" ? <LastUsedLabel /> : null}
      <MagicLinkInput
        surface={surface}
        redirectTo={redirectTo}
        onSent={onSent}
        initialEmail={email || initialEmail}
      />
    </>
  )

  if (!includeMagic) {
    return <>{oauth}<OrDivider /></>
  }

  if (loginStackOrder(lastMethod)[0] === "magic_link") {
    return <>{magic}<OrDivider />{oauth}</>
  }

  return <>{oauth}<OrDivider />{magic}</>
}
