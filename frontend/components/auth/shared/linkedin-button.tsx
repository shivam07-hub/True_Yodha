"use client"

import { signupEvents } from "@/lib/analytics"
import "./auth-shared.css"

interface Props {
  onClick: () => void
  disabled?: boolean
  surface: string
  label?: string
}

export function LinkedInAuthButton({ onClick, disabled, surface, label = "Continue with LinkedIn" }: Props) {
  return (
    <button
      type="button"
      className="tm-auth-provider-btn"
      disabled={disabled}
      onClick={() => {
        signupEvents.methodTapped({ method: "linkedin", surface })
        signupEvents.oauthRedirectStarted({ provider: "linkedin" })
        onClick()
      }}
    >
      <span className="tm-auth-provider-btn__icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#0A66C2">
          <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.37V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.26 2.37 4.26 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z"/>
        </svg>
      </span>
      {label}
    </button>
  )
}
