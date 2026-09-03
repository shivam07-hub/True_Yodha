"use client"

import { useState } from "react"
import { GoogleAuthButton } from "@/components/auth/shared/google-button"
import { LinkedInAuthButton } from "@/components/auth/shared/linkedin-button"
import { identityInitial, type GreetableIdentity } from "@/lib/auth/last-auth"
import "./auth-shared.css"

interface Props {
  identity: GreetableIdentity
  surface: string
  busy?: boolean
  onGoogle: () => void
  onLinkedIn: () => void
  onMagicLink: () => void
  onPassword: () => void
  onNotYou: () => void
  onOtherOptions: () => void
}

/**
 * The returning visitor's own card. The device already knows who signed in
 * here last, so this screen greets a person instead of asking one to identify
 * themselves — the whole point of remembering anything.
 *
 * Each method continues honestly: the two OAuth buttons redirect, the magic
 * link SENDS an email (so it may not say "continue"), and a password account
 * opens the password field. A card that promised one tap and delivered an
 * inbox would be worse than no card.
 */
export function ReturningIdentity({
  identity,
  surface,
  busy = false,
  onGoogle,
  onLinkedIn,
  onMagicLink,
  onPassword,
  onNotYou,
  onOtherOptions,
}: Props) {
  const [avatarBroken, setAvatarBroken] = useState(false)
  const { method, email, name, avatar } = identity
  const showAvatar = Boolean(avatar) && !avatarBroken

  return (
    <div className="tm-auth-returning">
      <div className="tm-auth-returning__who">
        {showAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar as string}
            alt=""
            referrerPolicy="no-referrer"
            className="tm-auth-returning__avatar"
            onError={() => setAvatarBroken(true)}
          />
        ) : (
          <span className="tm-auth-returning__avatar tm-auth-returning__avatar--initial" aria-hidden="true">
            {identityInitial(name, email)}
          </span>
        )}
        <span className="tm-auth-returning__lines">
          <span className="tm-auth-returning__name">{name ?? email}</span>
          {name ? <span className="tm-auth-returning__email">{email}</span> : null}
        </span>
      </div>

      {method === "google" && (
        <GoogleAuthButton surface={surface} disabled={busy} lastUsed onClick={onGoogle} />
      )}
      {method === "linkedin" && (
        <LinkedInAuthButton surface={surface} disabled={busy} lastUsed onClick={onLinkedIn} />
      )}
      {method === "magic_link" && (
        <button
          type="button"
          className="tm-auth-provider-btn tm-auth-provider-btn--primary"
          disabled={busy}
          aria-busy={busy}
          onClick={onMagicLink}
        >
          {busy ? "Sending…" : "Email me a link"}
        </button>
      )}
      {method === "password" && (
        <button
          type="button"
          className="tm-auth-provider-btn tm-auth-provider-btn--primary"
          disabled={busy}
          onClick={onPassword}
        >
          Enter password
        </button>
      )}

      <div className="tm-auth-returning__escapes">
        <button type="button" className="tm-auth-returning__switch" onClick={onNotYou}>
          Not you?
        </button>
        <span aria-hidden="true">·</span>
        <button type="button" className="tm-auth-returning__switch" onClick={onOtherOptions}>
          Other options
        </button>
      </div>
    </div>
  )
}
